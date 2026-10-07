import { Buffer } from "node:buffer";
import { enterAmbientScope, SequentialAsyncLocalStorage } from "../async-local-storage.ts";
import { registry } from "./registry.ts";

// What an edge runtime has and a browser tab lacks. It has to load before
// any module of Next's server does.

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
// The browser's Flight client reads properties off `__webpack_require__` when
// it loads, which is before the browser layer can say how it loads a module.
registry.browserRequire = (id) => registry.loadBrowserModule(id);

// Next patches the `fetch` of its server to cache and dedupe. That must not
// be the `fetch` of the page, which is the browser's.
const nativeFetch = globalThis.fetch;
registry.fetch = (input, init) => nativeFetch(input, init);

// An edge runtime has these as globals. A browser tab has none of them.
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
