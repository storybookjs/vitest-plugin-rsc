import type { WebApis } from "./page-host.ts";

// What a `Request` of the runtime's web APIs takes of the `init` of a DOM's.
// In a worker of Node.js the DOM's `FormData`, `Blob` and `AbortSignal` are
// not the runtime's, which its `Request` does not take: a test passes them to
// the server's requests, like the signal of a page load or a form of
// `handleRequest()` (nextjs/globals.ts), and with jsdom, which has no fetch
// API of its own, the page to its `fetch` (node-host.ts). In a browser they
// are one, and the `init` stays as it is.

const isOf = (value: unknown, of: abstract new (...args: never[]) => unknown) =>
  value instanceof of;

/** `init`, with a body or a signal of the DOM's as one of `runtime`'s. */
export function runtimeRequestInit(
  init: RequestInit | undefined,
  runtime: WebApis,
): RequestInit | undefined {
  const signal: AbortSignal | null | undefined = init?.signal;
  const body: unknown = init?.body;
  // A signal that follows the DOM's.
  if (signal && !isOf(signal, runtime.AbortSignal)) {
    const controller = new runtime.AbortController();
    if (signal.aborted) controller.abort(signal.reason);
    else signal.addEventListener("abort", () => controller.abort(signal.reason), { once: true });
    init = { ...init, signal: controller.signal };
  }
  if (
    (body instanceof FormData && !isOf(body, runtime.FormData)) ||
    (body instanceof Blob && !isOf(body, runtime.Blob))
  ) {
    init = { ...init, ...bodyOf(body, new runtime.Headers(init!.headers), runtime) };
  }
  return init;
}

// The bytes of a body of the DOM's, as the DOM's `Response` reads it, with
// the content type it gives it, or, for a DOM without one of its own, the
// fields of a form, as the runtime's `FormData`.
function bodyOf(
  body: FormData | Blob,
  headers: Headers,
  runtime: WebApis,
): RequestInit & { duplex: "half" } {
  if (globalThis.Response !== runtime.Response) {
    const read = new Response(body);
    const type = read.headers.get("content-type");
    if (type && !headers.has("content-type")) headers.set("content-type", type);
    return { body: read.body, headers, duplex: "half" };
  }
  if (!(body instanceof FormData)) {
    throw new Error("vitest-plugin-rsc: a Blob of this DOM is not a body for the server yet.");
  }
  const form = new runtime.FormData();
  for (const [name, value] of body) {
    if (typeof value !== "string") {
      throw new Error(
        "vitest-plugin-rsc: a file of a form of this DOM is not a body for the server yet.",
      );
    }
    form.append(name, value);
  }
  return { body: form, headers, duplex: "half" };
}
