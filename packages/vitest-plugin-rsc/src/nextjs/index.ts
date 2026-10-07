import "./globals.ts";
import type { ReactNode } from "react";
import { resetAsyncLocalStorage } from "../async-local-storage.ts";
import { createEnvironmentRunner, importEnvironment } from "../utilts.ts";
import { loadDocument, unloadDocument } from "./document.ts";
import * as viteClient from "virtual:vitest-plugin-rsc/next-vite-client";
import { registry } from "./registry.ts";

// The other two layers use the page's instance of Vite's client too.
registry.viteClient = viteClient;

// After globals.ts, which a module of Next's server needs: rsc, then ssr.
await import("./rsc.ts");
const ssr = await importEnvironment<typeof import("./ssr.ts")>(
  "next_ssr",
  "vitest-plugin-rsc/nextjs/ssr",
);

const nativeFetch = globalThis.fetch;

// The origin of the app is also the origin of the dev server. A `fetch` is
// the app's when its path is a route of the app, or when Next's router or a
// Server Action sends it, which mark their requests.
function isAppRequest(input: RequestInfo | URL, init: RequestInit | undefined): boolean {
  const request = input instanceof Request ? input : undefined;
  const url = new URL(request ? request.url : String(input), window.location.href);
  if (url.origin !== window.location.origin) return false;
  if (ssr.isRoute(url.pathname)) return true;
  const headers = new Headers(init?.headers ?? request?.headers);
  return headers.has("rsc") || headers.has("next-action");
}

// A test's own timers may be fake.
const setTimeout = globalThis.setTimeout;

// What was in the tab's storage before the app ran: the test runner's.
const storages = [localStorage, sessionStorage].map(
  (storage) => [storage, new Set(Object.keys(storage))] as const,
);

// The cookies the server has set, to forget them when the test ends.
const cookiesToClear = new Set<string>();

function clearCookies(): void {
  for (const cookie of document.cookie.split(";")) {
    const name = cookie.split("=")[0]!.trim();
    if (name) cookiesToClear.add(`${name}=; path=/`);
  }
  for (const cookie of cookiesToClear) {
    document.cookie = `${cookie}; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
  }
  cookiesToClear.clear();
}

// What a browser does for a same-origin request: send the cookies, store the
// ones that come back, follow redirects.
async function browserFetch(request: Request): Promise<Response> {
  let url = new URL(request.url);
  let method = request.method;
  // Read once: a 307 or 308 sends the body again.
  let body = request.body ? new Uint8Array(await request.arrayBuffer()) : null;
  let redirected = false;

  for (;;) {
    const headers = new Headers(request.headers);
    headers.set("host", url.host);
    if (!headers.has("user-agent")) headers.set("user-agent", navigator.userAgent);
    if (method !== "GET" && method !== "HEAD") headers.set("origin", url.origin);
    if (!headers.has("cookie") && document.cookie) headers.set("cookie", document.cookie);

    const response = await ssr.handleRequest({
      url: url.href,
      method,
      headers,
      body,
      signal: request.signal,
    });
    for (const cookie of response.headers.getSetCookie()) {
      // `document.cookie` is the cookie jar, and a script cannot store an
      // HttpOnly cookie there.
      document.cookie = cookie.replace(/;\s*httponly/i, "");
      const [pair, ...attributes] = cookie.split(";");
      const scope = attributes.filter((attribute) => /^\s*(path|domain)=/i.test(attribute));
      cookiesToClear.add([`${pair!.split("=")[0]}=`, ...scope].join(";"));
    }

    const location = response.headers.get("location");
    if (response.status >= 300 && response.status < 400 && location) {
      if (request.redirect === "manual") return response;
      url = new URL(location, url);
      // 307 and 308 repeat the request; the others turn it into a GET.
      if (response.status !== 307 && response.status !== 308) {
        method = "GET";
        body = null;
      }
      redirected = true;
      if (url.origin !== window.location.origin) {
        return nativeFetch(url, { method, headers: request.headers, body });
      }
      continue;
    }

    Object.defineProperties(response, {
      url: { value: url.href },
      redirected: { value: redirected },
    });
    return response;
  }
}

/**
 * Sends a request to the Next.js server of the app, like `fetch` from a page
 * of the app would. Use it to assert on a response itself: its status, its
 * headers, its HTML or Flight body.
 *
 * The request carries the tab's cookies, unless it has a `cookie` header.
 */
export function handleRequest(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  // Not the browser's Request, which drops a `cookie` header.
  return browserFetch(new registry.Request(input, init));
}

globalThis.fetch = (input, init) =>
  isAppRequest(input, init) ? browserFetch(new Request(input, init)) : nativeFetch(input, init);

// The server's `fetch`. A request to the app itself is one the server makes
// while it handles another, as Next does for the page a Server Action
// redirects to. It has its own headers, and skips the browser's cookie jar.
registry.fetch = (input, init) => {
  if (!isAppRequest(input, init)) return nativeFetch(input, init);
  const request = new registry.Request(input, init);
  return ssr.handleRequest(
    {
      url: request.url,
      method: request.method,
      headers: request.headers,
      body: request.body,
      signal: request.signal,
    },
    true,
  );
};
// Where the server reaches itself, which `next start` sets too.
process.env.__NEXT_PRIVATE_ORIGIN = window.location.origin;

let page: { started: Promise<unknown>; unmount(): void } | undefined;
// Tells a page load that the tab has moved on.
let currentLoad: AbortController | undefined;

export type RenderServerOptions = {
  /** The URL to open. Defaults to `/`. */
  url?: string;
  /** Headers for the request of the document, next to the ones a browser sends. */
  headers?: HeadersInit;
};

export type RenderServerResult = {
  /** The server's response to the request of the document. */
  response: Response;
  /** Leaves the page. The tab keeps its cookies until the test ends. */
  unmount(): Promise<void>;
};

/**
 * Opens a route of the Next.js app in this tab, as a browser does: it requests
 * the document from the server, shows the HTML it gets back, and starts the
 * app's client code, which hydrates it. From there Next's own router is in
 * charge, so links, forms and Server Actions work as they do in the app.
 *
 * With a node, the route renders that node where it has its page: one slice of
 * the app, inside the layouts, the request and the router of a real route.
 *
 * Resolves once the page has hydrated.
 */
export function renderServer(options: RenderServerOptions): Promise<RenderServerResult>;
export function renderServer(
  ui: ReactNode,
  options?: RenderServerOptions,
): Promise<RenderServerResult>;
export async function renderServer(
  ...args: [RenderServerOptions] | [ReactNode, RenderServerOptions?]
): Promise<RenderServerResult> {
  const [first, second] = args;
  const [node, options] = isOptions(first) ? [undefined, first] : [{ ui: first }, second ?? {}];
  const url = new URL(options.url ?? "/", window.location.origin);
  const headers = new Headers(options.headers);
  if (!headers.has("accept")) headers.set("accept", "text/html");

  // A URL that is not a route has no page to render the node in: it gets the
  // not-found page, like any other request for it.
  const route = node && ssr.pageOf(url.pathname);
  const response = await loadPage(url, { headers }, route ? { [route]: node.ui } : {});
  return {
    response,
    async unmount() {
      await leavePage();
      registry.pageOverrides = {};
    },
  };
}

// A plain object is never a node: an element carries a `$$typeof`.
function isOptions(value: unknown): value is RenderServerOptions {
  if (typeof value !== "object" || value === null || "$$typeof" in value) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

// `pageOverrides` is for a load that starts a test's page. A navigation that
// the page itself makes keeps the ones it has.
async function loadPage(
  url: URL,
  init: RequestInit,
  pageOverrides?: Record<string, unknown>,
): Promise<Response> {
  const leaving = leavePage();
  const load = (currentLoad = new AbortController());
  await leaving;
  const superseded = () => {
    if (load.signal.aborted) throw load.signal.reason;
  };
  superseded();

  if (pageOverrides) registry.pageOverrides = pageOverrides;

  const response = await browserFetch(new registry.Request(url, { ...init, signal: load.signal }));
  superseded();
  // A route handler can answer with anything: there is no app in it to start.
  const contentType = response.headers.get("content-type") ?? "";
  if (!/^text\/html\b/i.test(contentType)) {
    await response.body?.cancel();
    const what = `${response.url} responded with ${contentType || "no content type"}`;
    throw new Error(
      pageOverrides
        ? `vitest-plugin-rsc: ${what}, which is not a page to open. ` +
            `Use handleRequest() to assert on the response itself.`
        : `vitest-plugin-rsc: the app navigated to a URL that is not a page: ${what}. ` +
            `A browser would show or download it, which this tab cannot do.`,
    );
  }
  const { interactive } = loadDocument(response.body);
  // Where the browser ended up, after any redirects.
  window.history.replaceState(null, "", response.url);

  // The server can still be sending the rest of the document.
  await interactive;
  superseded();
  // A page load runs the app's scripts from scratch: a module graph of its own.
  const runner = createEnvironmentRunner("react_client");
  const client = await runner.import<typeof import("./client.tsx")>(
    "vitest-plugin-rsc/nextjs/client",
  );
  superseded();
  // The page is open from here: leaving it stops it, also while it hydrates.
  let unmount: (() => void) | undefined;
  let left = false;
  const started = client.start();
  page = {
    started: started.catch(() => {}),
    unmount() {
      left = true;
      unmount?.();
    },
  };
  try {
    ({ unmount } = await started);
  } catch (error) {
    // Starting an app whose page is gone fails in its own ways.
    superseded();
    throw error;
  }
  if (left) unmount();
  superseded();
  return response;
}

// One at a time: a page that is being left is left before the next one is.
let leaving: Promise<void> = Promise.resolve();

function leavePage(): Promise<void> {
  currentLoad?.abort(new DOMException("The page was left before it had loaded.", "AbortError"));
  currentLoad = undefined;
  const left = page;
  page = undefined;
  leaving = leaving.then(async () => {
    // An app that is still starting cannot be stopped, and would hydrate the
    // next page with the client code of this one. It is about done.
    await Promise.race([left?.started, new Promise((resolve) => setTimeout(resolve, 5000))]);
    left?.unmount();
    unloadDocument();
    await ssr.settleRequests();
    resetAsyncLocalStorage();
  });
  return leaving;
}

/**
 * Leaves the page that `renderServer()` opened and forgets the tab's cookies and
 * what the app put in its storage, like a new browser context. The server
 * forgets what it has cached. Runs before and after every test.
 */
export async function cleanup(): Promise<void> {
  await leavePage();
  registry.pageOverrides = {};
  ssr.resetCaches();
  clearCookies();
  for (const [storage, keys] of storages) {
    for (const key of Object.keys(storage)) if (!keys.has(key)) storage.removeItem(key);
  }
}

// The app can leave its page without its router: `location.assign()`, a
// `<form>` or an `<a>` that React does not handle. That would replace the test
// with the app, so load the page the way `renderServer()` does instead.
type NavigateEvent = Event & {
  destination: { url: string; sameDocument: boolean };
  hashChange: boolean;
  formData: FormData | null;
};
(window as { navigation?: EventTarget }).navigation?.addEventListener("navigate", (event) => {
  const { destination, hashChange, formData } = event as NavigateEvent;
  if (!page || destination.sameDocument || hashChange || !event.cancelable) return;
  const url = new URL(destination.url);
  if (url.origin !== window.location.origin) return;

  event.preventDefault();
  loadPage(url, {
    method: formData ? "POST" : "GET",
    headers: { accept: "text/html" },
    body: formData,
  }).catch((error: unknown) => {
    // The test moved on before the page had loaded.
    if (!(error instanceof DOMException && error.name === "AbortError")) reportError(error);
  });
});
