import {
  resolveRoutes,
  responseToMiddlewareResult,
  type MiddlewareContext,
  type MiddlewareResult,
  type ResolveRoutesResult,
} from "@next/routing";
import { filterInternalHeaders } from "next/dist/server/lib/server-ipc/utils";
import {
  fromNodeOutgoingHttpHeaders,
  splitCookiesString,
  toNodeOutgoingHttpHeaders,
} from "next/dist/server/web/utils";
import { routing } from "virtual:vitest-plugin-rsc/next-manifest";
import { openedAt, type ServerRequest } from "./registry.ts";

// The server in front of the app: Next's own route resolution, with the
// routes its build hands a deployment adapter. It goes through the redirects,
// rewrites and headers of `next.config`, the middleware, and the routes of the
// app, in the order of a deployment. Without `proxy`, only through the routes
// of the app: see `NextRouting.appRoutes`.
//
// It is the document's: with the build's routing alone it says which requests
// are the app's, before the ssr layer has loaded, see `takesRequest()`. The
// ssr layer has its own copy of this module, and routes each request that it
// handles again: see `handle()` in ssr.ts.

// The pathnames of what Next's build made, as its docs for an adapter list
// them for `resolveRoutes()`.
const pathnames = Object.keys(routing.outputs);

export type InvokeMiddleware = (context: MiddlewareContext) => Promise<MiddlewareResult>;

// A request as it comes in: without the headers that only Next's own server
// sets on one, like `x-middleware-set-cookie` for the cookies of the
// middleware. `next start` takes them off with the same function, before
// anything reads the request. And with the `x-forwarded-*` headers that
// `next start` gives a request that comes without them, for the URL it came
// in at: the middleware and the app read where the browser sent it from them.
// Not `x-forwarded-for`, the address of the client: there is no socket.
export function incoming<T extends Pick<ServerRequest, "url" | "headers">>(request: T): T {
  const headers = toNodeOutgoingHttpHeaders(request.headers) as Record<string, string | string[]>;
  filterInternalHeaders(headers);
  const url = new URL(request.url);
  const isHttps = url.protocol === "https:";
  headers["x-forwarded-host"] ??= headers.host ?? url.host;
  headers["x-forwarded-port"] ??= url.port || (isHttps ? "443" : "80");
  headers["x-forwarded-proto"] ??= isHttps ? "https" : "http";
  return { ...request, headers: fromNodeOutgoingHttpHeaders(headers) };
}

export async function resolve(
  request: Pick<ServerRequest, "url" | "headers">,
  requestBody: ReadableStream<Uint8Array>,
  invokeMiddleware: InvokeMiddleware,
  proxy: boolean,
): Promise<ResolveRoutesResult> {
  const resolved = await resolveRoutes({
    url: new URL(request.url),
    headers: request.headers,
    requestBody,
    basePath: routing.basePath,
    buildId: routing.buildId,
    pathnames,
    routes: proxy ? routing.routes : routing.appRoutes,
    invokeMiddleware,
  });
  // The `Set-Cookie` headers of one rule of `headers()` in `next.config` come
  // as one, joined with a comma: see `joinSetCookies()` in project/routing.ts.
  // Apart again, as `next start` sends them, with the split Next's own
  // `toNodeOutgoingHttpHeaders()` has for such a value.
  const headers = resolved.resolvedHeaders;
  const cookies = headers?.getSetCookie() ?? [];
  if (headers && cookies.length > 0) {
    headers.delete("set-cookie");
    for (const cookie of cookies.flatMap(splitCookiesString)) headers.append("set-cookie", cookie);
  }
  return resolved;
}

/**
 * What the middleware did with a request, read off its `response`, with the
 * `headers` and the `url` it got the request with: as `next start` reads it.
 *
 * That is `responseToMiddlewareResult()` of `@next/routing`, but for a
 * response with a `Location` header and a status that is no redirect. Next's
 * own server in front of the app, `resolveRoutes()` of
 * `next/dist/server/lib/router-utils/resolve-routes`, answers with that
 * response, its status and its body: the middleware answered itself. The
 * function of `@next/routing` keeps the header for the response, and says
 * neither a redirect nor `bodySent`, so its `resolveRoutes()` takes the
 * request on to a route. It leaves out such a response where it marks one
 * that answers itself, with `x-middleware-refresh`, as Next does, and only
 * Next's server has the branch that ends the request for it.
 */
export function middlewareResult(response: Response, headers: Headers, url: URL): MiddlewareResult {
  const result = responseToMiddlewareResult(response, headers, url);
  // With a redirect status, the header is a redirect.
  if (result.bodySent || result.redirect || !response.headers.has("location")) return result;
  // A rewrite to another server goes there, in Next's server too.
  if (result.rewrite && result.rewrite.origin !== url.origin) return result;
  return { ...result, bodySent: true };
}

// What the resolution answers with a redirect: one of `next.config`, of the
// middleware, or the one to a URL without its trailing slash.
export function redirectStatus(resolved: ResolveRoutesResult): number | undefined {
  const status = resolved.redirect?.status ?? resolved.status;
  return status !== undefined && status >= 300 && status < 400 ? status : undefined;
}

/**
 * Whether the server has something for a request: a route of the app, a page
 * or a route handler, the route of the node a test renders, a redirect or a
 * rewrite of `next.config`, or a middleware whose matcher takes it. Only
 * running the middleware tells what it does with the request. At the pathname
 * a test opened without `proxy`, only the routes count.
 *
 * Nothing runs for the answer, and nothing waits for it: not the ssr layer
 * either.
 */
export async function takesRequest(
  request: Pick<ServerRequest, "url" | "headers">,
): Promise<boolean> {
  const opened = openedAt(new URL(request.url));
  if (opened?.node) return true;
  let matched = false;
  const invokeMiddleware = async () => {
    matched = true;
    return {};
  };
  const proxy = opened?.proxy ?? true;
  const resolved = await resolve(incoming(request), new ReadableStream(), invokeMiddleware, proxy);
  return (
    matched ||
    redirectStatus(resolved) !== undefined ||
    resolved.externalRewrite !== undefined ||
    routing.outputs[resolved.resolvedPathname ?? ""] !== undefined
  );
}
