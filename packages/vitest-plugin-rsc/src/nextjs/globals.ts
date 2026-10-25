import { Buffer } from "node:buffer";
import env from "virtual:vitest-plugin-rsc/next-env";
import pageHost from "virtual:vitest-plugin-rsc/page-host";
import {
  asyncFunctionHooks,
  enterAmbientScope,
  SequentialAsyncLocalStorage,
} from "../async-local-storage.ts";
import { registry, type Opened } from "./registry.ts";

// Next's server runs here as it does on Node.js, with the web APIs that
// Node.js and a browser share: web streams, `fetch`, `crypto`. This file
// is the rest of that platform. It has to load before any module of Next's server does.

// A browser drops `cookie` from the headers of a Request and `set-cookie` from
// those of a Response. A server has to see both, so the server layers get
// these subclasses, which keep the headers they were given.
// Those of the host: the page's in a browser, Node's own in its worker.
const { Request: NativeRequest, Response: NativeResponse, Headers } = pageHost.serverWebApis;

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
    init = pageHost.fromPage(init);
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
            body.on("data", (chunk) =>
              controller.enqueue(
                typeof chunk === "string" ? new TextEncoder().encode(chunk) : new Uint8Array(chunk),
              ),
            );
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

  // Also as the constructor of the class it extends reads them, before this
  // one has its own: happy-dom's does.
  override get headers(): Headers {
    return #headers in this ? this.#headers : super.headers;
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
    return #headers in this ? this.#headers : super.headers;
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
registry.openedByRequest = new SequentialAsyncLocalStorage<Opened | undefined>();
registry.asyncFunctionHooks = asyncFunctionHooks;

// What React's Flight server in the rsc layer queues a microtask with
// (server-code.ts): the microtask has the stores of the code that queued it,
// as on Node.js. React starts a render in one, and Next has React call the
// function of a `"use cache"` that way, in the scope it entered for it.
const nativeQueueMicrotask = globalThis.queueMicrotask;
registry.queueMicrotask = (callback) =>
  nativeQueueMicrotask(SequentialAsyncLocalStorage.bind(callback));

// Each step of a render of React's Flight server has the stores of its first
// step, which React takes in the microtask above (server-code.ts). So what a
// cached component returns renders in the scope of that component, as on
// Node.js, and a cached component that it renders adds its tags to it.
const renders = new WeakMap<object, ReturnType<typeof SequentialAsyncLocalStorage.snapshot>>();
registry.performWork = (request, performWork) => {
  let inStores = renders.get(request);
  if (!inStores) renders.set(request, (inStores = SequentialAsyncLocalStorage.snapshot()));
  inStores(performWork, request);
};

// Next patches the `fetch` of its server to cache and dedupe. That must not
// be the `fetch` of the page, which is the browser's.
const nativeFetch = pageHost.serverWebApis.fetch;
registry.fetch = (input, init) => nativeFetch(input, init);
registry.network = (input, init) => nativeFetch(input, init);

// Node.js has these as globals. A browser has none of them.
const scope = globalThis as Record<string, any>;

scope.process ??= { env: {} };
scope.process.env ??= {};
// The env of the run (project/env.ts), before any module of the app reads
// it. For a name the page does not have: the page's own value wins.
for (const [name, value] of Object.entries(env)) scope.process.env[name] ??= value;
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
// base64url, which Node.js has since 15 and the polyfill does not: Prisma's
// client reads its query plans with it. It is base64 with `-` and `_`, and
// without padding. An encoding's name is any case, as in Node.js.
{
  const isBase64url = (encoding: unknown) =>
    typeof encoding === "string" && encoding.toLowerCase() === "base64url";
  const base64 = (text: string) => text.replaceAll("-", "+").replaceAll("_", "/");
  const base64url = (text: string) =>
    text.replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
  const statics = Buffer as unknown as Record<string, (...args: any[]) => any>;
  const { from, byteLength, isEncoding } = statics;
  statics.from = function (value: unknown, encoding?: unknown, ...rest: unknown[]) {
    return isBase64url(encoding) && typeof value === "string"
      ? from!.call(this, base64(value), "base64")
      : from!.call(this, value, encoding, ...rest);
  };
  statics.byteLength = function (value: unknown, encoding?: unknown) {
    return isBase64url(encoding) && typeof value === "string"
      ? byteLength!.call(this, base64(value), "base64")
      : byteLength!.call(this, value, encoding);
  };
  statics.isEncoding = (encoding: unknown) =>
    isBase64url(encoding) || isEncoding!.call(Buffer, encoding);
  const prototype = Buffer.prototype as unknown as Record<string, (...args: any[]) => any>;
  // As functions of any arguments: `toString` of a Record is Object's.
  const toString = prototype.toString as (...args: unknown[]) => string;
  const write = prototype.write as (...args: unknown[]) => number;
  prototype.toString = function (this: Buffer, encoding?: unknown, ...rest: unknown[]) {
    return isBase64url(encoding)
      ? base64url(toString.apply(this, ["base64", ...rest]))
      : toString.apply(this, [encoding, ...rest]);
  };
  // `write(string, offset?, length?, encoding?)`: the encoding is the last
  // argument that is a string.
  prototype.write = function (this: Buffer, text: string, ...rest: unknown[]) {
    const at = rest.findLastIndex((value) => typeof value === "string");
    if (at === -1 || !isBase64url(rest[at])) return write.apply(this, [text, ...rest]);
    const args = [...rest];
    args[at] = "base64";
    return write.apply(this, [base64(text), ...args]);
  };
}
scope.AsyncLocalStorage ??= SequentialAsyncLocalStorage;

// Immediates of the speed feature `immediates`: a task each, by a message of one
// channel, which no browser delays as it does a timeout. Each by a symbol of
// its own, which is no id of a timer.
const immediates = new Map<symbol, () => void>();
const channel = new MessageChannel();
channel.port1.onmessage = () => {
  const [id, run] = immediates.entries().next().value ?? [];
  if (id === undefined) return;
  immediates.delete(id);
  run!();
};
function immediate(callback: (...args: unknown[]) => void, args: unknown[]): symbol {
  const id = Symbol("immediate");
  immediates.set(id, () => callback(...args));
  channel.port2.postMessage(null);
  return id;
}

// What Next's Node.js server asks of its process. The `process` is the page's
// and the test's too, so as little as it needs: a library that finds a
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
  // of the globals (server-code.ts), so there is no global `setImmediate`. Not
  // a timer of the test, which may be fake.
  const nativeSetTimeout = globalThis.setTimeout;
  const nativeClearTimeout = globalThis.clearTimeout;
  registry.setImmediate = (callback, ...args) =>
    registry.speedFeatures?.immediates
      ? immediate(callback, args)
      : nativeSetTimeout(callback, 0, ...args);
  registry.clearImmediate = (id) =>
    typeof id === "symbol" ? immediates.delete(id) : nativeClearTimeout(id as number);

  // Server code's `setTimeout` (server-code.ts), the global as the code calls
  // it, also a fake one of the test. React renders Flight and HTML for the
  // edge with `setTimeout(work, 0)` between its steps, where on Node.js it
  // takes `setImmediate`: a browser waits at least 4 ms for a timeout that a
  // timeout started, five deep, so a render of a page waited longer than it
  // worked. The speed feature `immediates` runs a timeout of no delay as an
  // immediate, unless the test made the timers fake.
  registry.setTimeout = (callback, delay, ...args) =>
    registry.speedFeatures?.immediates &&
    !(Number(delay) > 0) &&
    typeof callback === "function" &&
    globalThis.setTimeout === nativeSetTimeout
      ? immediate(callback as (...args: unknown[]) => void, args)
      : // As Node.js, which takes no code in a string.
        globalThis.setTimeout(callback as (...args: unknown[]) => void, delay, ...args);
  registry.clearTimeout = (id) =>
    typeof id === "symbol" ? immediates.delete(id) : globalThis.clearTimeout(id as number);

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
  // One decoder each: busboy decodes every header and field of a form, and
  // a decode without `stream` keeps nothing from one call to the next.
  const utf8 = new TextDecoder("utf-8");
  const ucs2 = new TextDecoder("utf-16le");
  const decoders: Record<string, (bytes: Uint8Array) => string> = {
    latin1,
    ascii: latin1,
    utf8: (bytes) => utf8.decode(bytes),
    ucs2: (bytes) => ucs2.decode(bytes),
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
