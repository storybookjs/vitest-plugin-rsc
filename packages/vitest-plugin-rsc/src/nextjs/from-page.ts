// A request of the page, as the server takes it. The page's web APIs are the
// window's, and the server's those of the global it runs on: in a browser
// one realm, and in a worker of Node.js with happy-dom two, as the window is
// a context of its own there (happy-dom-environment.ts), whose `Request`,
// `Headers`, `FormData`, `Blob` and `AbortSignal` the server's `Request` does
// not take. A request leaves the page through its `fetch` and the DOM's
// interceptor (browser-context.ts), and as a form that the browser submits
// itself (document-loads.ts): there, and only there, it becomes the server's.
// What the page gets back is one of its own: see `pageResponse()` in
// app-requests.ts.

/** `input` and `init` of a request of the page, as the server's `Request` takes them. */
export function fromPage(
  input: RequestInfo | URL,
  init?: RequestInit,
): [RequestInfo | URL, RequestInit | undefined] {
  if (window.Request === globalThis.Request) return [input, init];
  if (input instanceof window.Request) {
    // A copy: the page's own goes to the network if the app has nothing for it.
    const { url, method, headers, body, signal, redirect, credentials } = input.body
      ? input.clone()
      : input;
    init = { method, headers, body, signal, redirect, credentials, ...init };
    input = url;
  }
  // A URL of the page's, which the server's `Request` does not resolve.
  input = new URL(String(input), window.location.href);
  if (!init) return [input, init];
  const headers = new Headers(init.headers ? [...new window.Headers(init.headers)] : undefined);
  let { body, signal } = init;
  // A form or a file of the page, as the bytes its `Response` reads of it.
  if (body instanceof window.FormData || body instanceof window.Blob) {
    const read = new window.Response(body);
    const type = read.headers.get("content-type");
    if (type && !headers.has("content-type")) headers.set("content-type", type);
    body = read.body;
  }
  // A signal that follows the page's.
  if (signal && !(signal instanceof AbortSignal)) {
    const controller = new AbortController();
    const page: AbortSignal = signal;
    if (page.aborted) controller.abort(page.reason);
    else page.addEventListener("abort", () => controller.abort(page.reason), { once: true });
    signal = controller.signal;
  }
  return [input, { ...init, headers, body, signal, ...(body ? { duplex: "half" } : {}) }];
}
