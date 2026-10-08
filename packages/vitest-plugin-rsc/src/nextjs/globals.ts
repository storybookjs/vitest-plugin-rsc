import { Buffer } from "node:buffer";
import { enterAmbientScope, SequentialAsyncLocalStorage } from "../async-local-storage.ts";
import { registry } from "./registry.ts";

// Next's server runs here as it does on Node.js, with the web APIs that
// Node.js and a browser tab share: web streams, `fetch`, `crypto`. This file
// is the rest of that platform. It has to load before any module of Next's server does.

// A browser drops `cookie` from the headers of a Request and `set-cookie` from
// those of a Response. A server has to see both, so the server layers get
// these subclasses, which keep the headers they were given.
const NativeRequest = Request;
const NativeResponse = Response;

function headersOf(init: { headers?: HeadersInit } | undefined, input?: unknown): Headers {
  if (init?.headers) return new Headers(init.headers);
  return new Headers(input instanceof NativeRequest ? input.headers : undefined);
}

type NodeReadable = {
  on(event: string, listener: (value: any) => void): void;
  pipe: unknown;
  destroy?(reason?: unknown): void;
};

class ServerRequest extends NativeRequest {
  #headers: Headers;

  constructor(input: RequestInfo | URL, init?: RequestInit) {
    // A browser wants `duplex` for a streamed body. Server runtimes, which
    // Next's code is written for, do not.
    // Node's `Request` also takes a Node.js stream for a body, and Next's
    // Node.js server gives it the request it got.
    const body = init?.body as unknown as NodeReadable | undefined;
    if (body && typeof body.on === "function" && typeof body.pipe === "function") {
      init = {
        ...init,
        body: new ReadableStream<Uint8Array>({
          start(controller) {
            body.on("data", (chunk) => controller.enqueue(new Uint8Array(chunk)));
            body.on("end", () => controller.close());
            body.on("error", (error) => controller.error(error));
          },
          cancel: (reason) => body.destroy?.(reason),
        }),
      };
    }
    super(input, init?.body ? ({ duplex: "half", ...init } as RequestInit) : init);
    this.#headers = headersOf(init, input);
    // The content type of a body like FormData, with the boundary of its parts.
    const contentType = super.headers.get("content-type");
    if (contentType && !this.#headers.has("content-type")) {
      this.#headers.set("content-type", contentType);
    }
  }

  override get headers(): Headers {
    return this.#headers;
  }

  override clone(): ServerRequest {
    return new ServerRequest(super.clone(), { headers: this.#headers });
  }

  // Any request is one of these; subclasses keep the regular check.
  static override [Symbol.hasInstance](value: unknown): boolean {
    return Function.prototype[Symbol.hasInstance].call(
      this === ServerRequest ? NativeRequest : this,
      value,
    );
  }
}

class ServerResponse extends NativeResponse {
  #headers: Headers;

  constructor(body?: BodyInit | null, init?: ResponseInit) {
    super(body, init);
    this.#headers = headersOf(init);
    const contentType = super.headers.get("content-type");
    if (contentType && !this.#headers.has("content-type")) {
      this.#headers.set("content-type", contentType);
    }
  }

  override get headers(): Headers {
    return this.#headers;
  }

  override clone(): ServerResponse {
    const clone = super.clone();
    return new ServerResponse(clone.body, {
      status: clone.status,
      statusText: clone.statusText,
      headers: this.#headers,
    });
  }

  // The browser's `json()` makes a browser Response, which drops `set-cookie`.
  // This lets the browser check and build it, then makes it one of these.
  // Like the browser's, it makes one of this class also when a subclass calls
  // it: NextResponse.json() wraps it itself. `redirect()` takes no headers to
  // drop, so it stays the browser's, with the headers it cannot change.
  static override json(data: unknown, init?: ResponseInit): ServerResponse {
    const json = NativeResponse.json(data, init);
    const headers = headersOf(init);
    if (!headers.has("content-type")) headers.set("content-type", "application/json");
    return new ServerResponse(json.body, {
      status: json.status,
      statusText: json.statusText,
      headers,
    });
  }

  // Any response is one of these; subclasses keep the regular check.
  static override [Symbol.hasInstance](value: unknown): boolean {
    return Function.prototype[Symbol.hasInstance].call(
      this === ServerResponse ? NativeResponse : this,
      value,
    );
  }
}

registry.Request = ServerRequest;
registry.Response = ServerResponse;
registry.enterRequestScope = enterAmbientScope;

// Next patches the `fetch` of its server to cache and dedupe. That must not
// be the `fetch` of the page, which is the browser's.
const nativeFetch = globalThis.fetch;
registry.fetch = (input, init) => nativeFetch(input, init);
registry.network = (input, init) => nativeFetch(input, init);

// Node.js has these as globals. A browser tab has none of them.
const scope = globalThis as Record<string, any>;

scope.process ??= { env: {} };
scope.process.env ??= {};
scope.global ??= scope;
scope.global.process ??= scope.process;
scope.Buffer ??= Buffer;

// Node's `Buffer#indexOf` takes any Uint8Array, and Next's stream code relies
// on it. The polyfill only takes a Buffer.
for (const method of ["indexOf", "lastIndexOf"] as const) {
  const original = Buffer.prototype[method] as (...args: unknown[]) => number;
  Buffer.prototype[method] = function (this: Buffer, value: unknown, ...rest: unknown[]) {
    if (value instanceof Uint8Array && !Buffer.isBuffer(value)) {
      value = Buffer.from(value.buffer, value.byteOffset, value.byteLength);
    }
    return original.call(this, value, ...rest);
  } as never;
}
scope.AsyncLocalStorage ??= SequentialAsyncLocalStorage;

// What Next's Node.js server asks of its process. The tab is the page's and
// the test's too, so as little as it needs: a library that finds a
// `setImmediate` or a full `process` takes itself to be on Node.js.
{
  const { process } = scope;
  process.cwd ??= () => "/";
  process.on ??= () => process;
  process.off ??= () => process;
  process.nextTick ??= (callback: (...args: unknown[]) => void, ...args: unknown[]) =>
    queueMicrotask(() => callback(...args));
  process.hrtime ??= Object.assign(() => [0, 0], {
    bigint: () => BigInt(Math.round(performance.now() * 1e6)),
  });

  // A task of its own, after the microtasks: what Next's Node.js server waits
  // for between the stages of a render. Server code gets these two in place
  // of the globals (server-code.ts), so the tab has no `setImmediate`. Not a
  // timer of the test, which may be fake.
  const nativeSetTimeout = globalThis.setTimeout;
  const nativeClearTimeout = globalThis.clearTimeout;
  registry.setImmediate = (callback, ...args) => nativeSetTimeout(callback, 0, ...args);
  registry.clearImmediate = (id) => nativeClearTimeout(id as number);

  // Node's own `Buffer` has these, and busboy reads the parts of a form with
  // them. Every layer has its own copy of the `Buffer` polyfill, and each is a
  // Uint8Array.
  // Not a `TextDecoder` for latin1: the one of a browser is windows-1252,
  // where a byte like 0x83 is a character past 255. That byte is in the
  // UTF-8 of `テ`, and busboy drops a file with such a character in its name.
  const latin1 = (bytes: Uint8Array) => {
    let text = "";
    for (let at = 0; at < bytes.length; at += 8192) {
      text += String.fromCharCode(...bytes.subarray(at, at + 8192));
    }
    return text;
  };
  const decoders: Record<string, (bytes: Uint8Array) => string> = {
    latin1,
    ascii: latin1,
    utf8: (bytes) => new TextDecoder("utf-8").decode(bytes),
    ucs2: (bytes) => new TextDecoder("utf-16le").decode(bytes),
  };
  for (const [encoding, decode] of Object.entries(decoders)) {
    if (`${encoding}Slice` in Uint8Array.prototype) continue;
    Object.defineProperty(Uint8Array.prototype, `${encoding}Slice`, {
      configurable: true,
      writable: true,
      value(this: Uint8Array, start?: number, end?: number) {
        return decode(this.subarray(start, end));
      },
    });
  }
}
