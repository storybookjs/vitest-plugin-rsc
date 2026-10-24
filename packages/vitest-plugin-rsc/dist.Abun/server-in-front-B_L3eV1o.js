import { r as openedAt } from "./registry-DPyevx_W.js";
import { resolveRoutes, responseToMiddlewareResult } from "@next/routing";
import { routing } from "virtual:vitest-plugin-rsc/next-manifest";
import { filterInternalHeaders } from "next/dist/server/lib/server-ipc/utils.js";
import { fromNodeOutgoingHttpHeaders, splitCookiesString, toNodeOutgoingHttpHeaders } from "next/dist/server/web/utils.js";
//#region src/nextjs/server-in-front.ts
const pathnames = Object.keys(routing.outputs);
function incoming(request) {
	const headers = toNodeOutgoingHttpHeaders(request.headers);
	filterInternalHeaders(headers);
	const url = new URL(request.url);
	const isHttps = url.protocol === "https:";
	headers["x-forwarded-host"] ??= headers.host ?? url.host;
	headers["x-forwarded-port"] ??= url.port || (isHttps ? "443" : "80");
	headers["x-forwarded-proto"] ??= isHttps ? "https" : "http";
	return {
		...request,
		headers: fromNodeOutgoingHttpHeaders(headers)
	};
}
async function resolve(request, requestBody, invokeMiddleware, proxy) {
	const resolved = await resolveRoutes({
		url: new URL(request.url),
		headers: request.headers,
		requestBody,
		basePath: routing.basePath,
		buildId: routing.buildId,
		pathnames,
		routes: proxy ? routing.routes : routing.appRoutes,
		invokeMiddleware
	});
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
function middlewareResult(response, headers, url) {
	const result = responseToMiddlewareResult(response, headers, url);
	if (result.bodySent || result.redirect || !response.headers.has("location")) return result;
	if (result.rewrite && result.rewrite.origin !== url.origin) return result;
	return {
		...result,
		bodySent: true
	};
}
function redirectStatus(resolved) {
	const status = resolved.redirect?.status ?? resolved.status;
	return status !== void 0 && status >= 300 && status < 400 ? status : void 0;
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
async function takesRequest(request) {
	const opened = openedAt(new URL(request.url));
	if (opened?.node) return true;
	let matched = false;
	const invokeMiddleware = async () => {
		matched = true;
		return {};
	};
	const proxy = opened?.proxy ?? true;
	const resolved = await resolve(incoming(request), new ReadableStream(), invokeMiddleware, proxy);
	return matched || redirectStatus(resolved) !== void 0 || resolved.externalRewrite !== void 0 || routing.outputs[resolved.resolvedPathname ?? ""] !== void 0;
}
//#endregion
export { takesRequest as a, resolve as i, middlewareResult as n, redirectStatus as r, incoming as t };
