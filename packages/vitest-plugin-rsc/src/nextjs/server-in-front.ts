import {
  resolveRoutes,
  type MiddlewareContext,
  type MiddlewareResult,
  type ResolveRoutesResult,
} from "@next/routing";
import { filterInternalHeaders } from "next/dist/server/lib/server-ipc/utils";
import { fromNodeOutgoingHttpHeaders, toNodeOutgoingHttpHeaders } from "next/dist/server/web/utils";
import { routing } from "virtual:vitest-plugin-rsc/next-manifest";
import { openedAt, type ServerRequest } from "./registry.ts";

// The server in front of the app: Next's own route resolution, with the
// routes its build hands a deployment adapter. It goes through the redirects,
// rewrites and headers of `next.config`, the middleware, and the routes of the
// app, in the order of a deployment. Without `proxy`, only through the routes
// of the app: see `NextRouting.appRoutes`.
//
// It is the document's: with the build's routing alone it says which requests
// are the app's, before any layer of the app has loaded, see `takesRequest()`.
// The ssr layer has a module of its own of it, for the requests it routes
// there: see `handle()` in ssr.ts.

// The pathnames of what Next's build made, as its docs for an adapter list
// them for `resolveRoutes()`.
const pathnames = Object.keys(routing.outputs);

export type InvokeMiddleware = (context: MiddlewareContext) => Promise<MiddlewareResult>;

// A request as it comes in: without the headers that only Next's own server
// sets on one, like `x-middleware-set-cookie` for the cookies of the
// middleware. `next start` takes them off with the same function, before
// anything reads the request.
export function incoming<T extends Pick<ServerRequest, "headers">>(request: T): T {
  const headers = toNodeOutgoingHttpHeaders(request.headers) as Record<string, string | string[]>;
  filterInternalHeaders(headers);
  return { ...request, headers: fromNodeOutgoingHttpHeaders(headers) };
}

export function resolve(
  request: Pick<ServerRequest, "url" | "headers">,
  requestBody: ReadableStream<Uint8Array>,
  invokeMiddleware: InvokeMiddleware,
  proxy: boolean,
): Promise<ResolveRoutesResult> {
  return resolveRoutes({
    url: new URL(request.url),
    headers: request.headers,
    requestBody,
    basePath: routing.basePath,
    buildId: routing.buildId,
    pathnames,
    routes: proxy ? routing.routes : routing.appRoutes,
    invokeMiddleware,
  });
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
 * Nothing runs for the answer, and nothing waits for it: not the layers of
 * the app either.
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
