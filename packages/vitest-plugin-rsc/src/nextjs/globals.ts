import { Buffer } from "node:buffer";
import { enterAmbientScope, SequentialAsyncLocalStorage } from "../async-local-storage.ts";
import { registry } from "./registry.ts";

// Next's server runs here as it does on an edge runtime, which is close to a
// browser tab: web streams, `fetch`, `crypto`. This file is the rest of that
// platform. It has to load before any module of Next's server does.

// A browser drops `cookie` from the headers of a Request and `set-cookie` from
// those of a Response. A server has to see both, so the server layers get
// these subclasses, which keep the headers they were given.
const NativeRequest = Request;
const NativeResponse = Response;

function headersOf(init: { headers?: HeadersInit } | undefined, input?: unknown): Headers {
  if (init?.headers) return new Headers(init.headers);
  return new Headers(input instanceof NativeRequest ? input.headers : undefined);
}

class ServerRequest extends NativeRequest {
  #headers: Headers;

  constructor(input: RequestInfo | URL, init?: RequestInit) {
    // A browser wants `duplex` for a streamed body. Server runtimes, which
    // Next's code is written for, do not.
    super(input, init?.body ? ({ duplex: "half", ...init } as RequestInit) : init);
    this.#headers = headersOf(init, input);
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

// An edge runtime has these as globals. A browser tab has none of them.
const scope = globalThis as Record<string, any>;

scope.process ??= { env: {} };
scope.process.env ??= {};
// What Next's Node.js server asks of its process.
scope.process.cwd ??= () => "/";
scope.process.on ??= () => scope.process;
scope.process.off ??= () => scope.process;
scope.process.nextTick ??= (callback: (...args: unknown[]) => void, ...args: unknown[]) =>
  queueMicrotask(() => callback(...args));
scope.process.hrtime ??= Object.assign(() => [0, 0], {
  bigint: () => BigInt(Math.round(performance.now() * 1e6)),
});
// A task of its own, after the microtasks: what Next's Node.js server waits
// for between the stages of a render. Not a timer of the test, which may be
// fake.
const nativeSetTimeout = globalThis.setTimeout;
const nativeClearTimeout = globalThis.clearTimeout;
scope.setImmediate ??= (callback: (...args: unknown[]) => void, ...args: unknown[]) =>
  nativeSetTimeout(callback, 0, ...args);
scope.clearImmediate ??= (id: number) => nativeClearTimeout(id);
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
