import { i as registry, r as openedAt, t as actionModulePrefix } from "../registry-DPyevx_W.js";
import { i as resolve, n as middlewareResult, r as redirectStatus, t as incoming } from "../server-in-front-B_L3eV1o.js";
import { t as registerModuleLoader } from "../client-modules-iQQDUeCs.js";
import { build, nextConfig, preview, routes, routesManifest, routing } from "virtual:vitest-plugin-rsc/next-manifest";
import { fromNodeOutgoingHttpHeaders, normalizeNextQueryParam, toNodeOutgoingHttpHeaders } from "next/dist/server/web/utils.js";
import { NEXT_CACHE_IMPLICIT_TAG_ID, RSC_SUFFIX } from "next/dist/lib/constants.js";
import { normalizePagePath } from "next/dist/shared/lib/page-path/normalize-page-path.js";
import { cacheHandler, cacheHandlers } from "virtual:vitest-plugin-rsc/next-cache-handlers";
import { IncrementalCache } from "next/dist/server/lib/incremental-cache/index.js";
import { tagsManifest } from "next/dist/server/lib/incremental-cache/tags-manifest.external";
import { nodeFs } from "next/dist/server/lib/node-fs-methods.js";
import { initializeCacheHandlers, registerCustomCacheHandlers, setCacheHandler } from "next/dist/server/use-cache/handlers.js";
import { NEXT_REWRITTEN_PATH_HEADER, NEXT_REWRITTEN_QUERY_HEADER, NEXT_ROUTER_PREFETCH_HEADER, NEXT_RSC_UNION_QUERY, RSC_HEADER } from "next/dist/client/components/app-router-headers.js";
import { isRSCRequestHeader } from "next/dist/server/lib/is-rsc-request.js";
import * as appPageModule from "next/dist/server/route-modules/app-page/module.js";
import { getIsPossibleServerAction } from "next/dist/server/lib/server-action-request-meta.js";
import { getRouteMatcher } from "next/dist/shared/lib/router/utils/route-matcher.js";
import { getRouteRegex } from "next/dist/shared/lib/router/utils/route-regex.js";
import { Readable } from "vitest-plugin-rsc/node/stream";
import { isDynamicServerError } from "next/dist/client/components/hooks-server-context.js";
import { MockedResponse } from "next/dist/server/lib/mock-request.js";
//#region src/nextjs/action-ids.ts
const actionIdField = "$ACTION_ID_";
const actionReferenceField = "$ACTION_REF_";
/**
* The ids of the Server Actions that `request` names. Next's router names the
* one it calls in the `next-action` header. A form that the browser posts
* itself, as React renders one for a Server Action, to work before the app
* has hydrated or without JavaScript, names them in its fields, which Next's
* `decodeAction()` and `areAllActionIdsValid()` read: a field
* `$ACTION_ID_<id>`, or `$ACTION_REF_<n>` with the id in the field
* `$ACTION_<n>:0`, for an action with bound arguments.
*
* Next reads the whole body of such a request first, and so does this: from
* a copy, which leaves `request` a body of its own.
*/
async function actionIdsOf(request) {
	if (request.method !== "POST") return [];
	const header = request.headers.get("next-action");
	if (header !== null) return [header];
	const contentType = request.headers.get("content-type") ?? "";
	if (!/^multipart\/form-data\b/i.test(contentType)) return [];
	let { body } = request;
	if (body instanceof ReadableStream) [body, request.body] = body.tee();
	let form;
	try {
		form = await new registry.Response(body, { headers: { "content-type": contentType } }).formData();
	} catch {
		return [];
	}
	const ids = [];
	for (const name of form.keys()) {
		if (name.startsWith(actionIdField)) ids.push(name.slice(11));
		if (!name.startsWith(actionReferenceField)) continue;
		const reference = form.get(`$ACTION_${name.slice(12)}:0`);
		try {
			const { id } = JSON.parse(typeof reference === "string" ? reference : "");
			if (typeof id === "string") ids.push(id);
		} catch {}
	}
	return ids;
}
//#endregion
//#region src/nextjs/build-output.ts
const anyKey = (create) => new Proxy({}, {
	get: (_, key) => typeof key === "string" ? create(key) : void 0,
	has: () => true
});
const stylesheets = /* @__PURE__ */ new Map();
const fontFiles = /* @__PURE__ */ new Map();
function setStylesheets(of) {
	for (const [file, entries] of Object.entries(of)) {
		stylesheets.set(file, entries.map(({ path, content }) => content === void 0 ? {
			path,
			inlined: false
		} : {
			path,
			inlined: true,
			content
		}));
		const fonts = entries.flatMap((entry) => entry.fonts ?? []);
		if (fonts.length === 0) fontFiles.delete(file);
		else fontFiles.set(file, fonts.filter((font) => /\.p\.(?:woff|woff2|eot|ttf|otf)$/.test(font)));
	}
}
const nextFontManifest = {
	pages: {},
	app: new Proxy({}, {
		get: (_, key) => typeof key === "string" ? fontFiles.get(key) : void 0,
		has: (_, key) => typeof key === "string" && fontFiles.has(key)
	}),
	appUsingSizeAdjust: false,
	pagesUsingSizeAdjust: false
};
const clientReference = anyKey((id) => anyKey((name) => ({
	id,
	name,
	chunks: [],
	async: true
})));
const clientReferenceManifest = {
	moduleLoading: {
		prefix: "",
		crossOrigin: null
	},
	clientModules: anyKey((id) => ({
		id,
		name: "*",
		chunks: [],
		async: true
	})),
	ssrModuleMapping: clientReference,
	rscModuleMapping: clientReference,
	entryCSSFiles: anyKey((file) => stylesheets.get(file) ?? []),
	entryJSFiles: anyKey(() => [])
};
const buildManifest = {
	polyfillFiles: [],
	rootMainFiles: ["static/chunks/main-app.js"],
	devFiles: [],
	lowPriorityFiles: [],
	pages: {}
};
let serverActions = {};
function setServerActions(ids) {
	serverActions = Object.fromEntries(Array.from(ids, (id) => [id, {
		workers: anyKey(() => ({
			moduleId: actionModulePrefix + id,
			async: true
		})),
		layer: {}
	}]));
}
let prerenderManifest = {
	version: 4,
	routes: {},
	dynamicRoutes: {},
	notFoundRoutes: [],
	preview
};
/**
* Lists what Next's build prerenders of a route, by its verdict: the entries
* of the prerender manifest that Next's handler reads. With them the handler
* prerenders a pathname at its first request, keeps it, and serves it from
* then on, as `next start` serves what the build prerendered. Without the
* `revalidate` the build writes: Next's cache reads it for a page the build
* prerendered, and here every page is first prerendered by the handler,
* which keeps the `revalidate` of the render with it.
*/
function recordRoute(route, verdict) {
	if (!verdict) return;
	const { pathname: srcRoute, kind } = route;
	const dataRouteOf = (pathname) => kind === "page" ? `${normalizePagePath(pathname)}${RSC_SUFFIX}` : null;
	for (const pathname of verdict.pathnames) prerenderManifest.routes[pathname] = {
		srcRoute,
		dataRoute: dataRouteOf(pathname)
	};
	if (verdict.fallback !== void 0) prerenderManifest = {
		...prerenderManifest,
		dynamicRoutes: {
			...prerenderManifest.dynamicRoutes,
			[srcRoute]: {
				fallback: verdict.fallback,
				dataRoute: dataRouteOf(srcRoute)
			}
		}
	};
}
const built = /* @__PURE__ */ new Set();
/** Forgets what the build kept, as the server's cache forgets its entries. */
function forgetBuilt() {
	built.clear();
}
/**
* A page as the build keeps it, which Next's handler is about to keep for
* `pathname`, at the first prerender of that pathname in this `generation`
* of the cache. The build keeps a page of a parallel route's slot without a
* status (`export/routes/app-page.js:126-141`), which `next start` serves
* with 200: a page whose other slots have no page for its path renders the
* not-found page there, which a page load shows, and a navigation, which
* keeps the other slots as they are, does not. Next's handler would keep
* the status of its render, 404, and Next's router takes a navigation that
* answers 404 for a page load. So the entry gets 200, in place: the handler
* answers the request of its prerender with the status of the entry it
* keeps, and otherwise with the one its render set. `route` is the source
* of the entry, the page, as Next's response cache hands it to the cache.
*/
function keptAsBuilt(pathname, value, { route }, generation) {
	if (value?.kind !== "APP_PAGE" || !(pathname in prerenderManifest.routes)) return;
	const key = `${generation}:${pathname}`;
	if (built.has(key)) return;
	built.add(key);
	if (value.status !== void 0 && /\/@\w+/.test(route?.sourceRoute ?? "")) value.status = 200;
}
let hidden;
/**
* Hands Next's handler a manifest without `route` for `respond()`, the
* response of a prefetch: Next reads the manifest as it starts a request.
*/
async function withoutRoute(route, respond) {
	const before = hidden;
	hidden = route.pathname;
	try {
		return await respond();
	} finally {
		hidden = before;
	}
}
function currentPrerenderManifest() {
	const route = hidden;
	if (route === void 0 || !isPrerendered({
		kind: "page",
		page: "",
		pathname: route
	})) return prerenderManifest;
	const { [route]: _, ...dynamicRoutes } = prerenderManifest.dynamicRoutes;
	return {
		...prerenderManifest,
		routes: Object.fromEntries(Object.entries(prerenderManifest.routes).filter(([, entry]) => entry.srcRoute !== route)),
		dynamicRoutes
	};
}
/** Whether the build prerenders a route, or a pathname of it. */
function isPrerendered(route) {
	return route.pathname in prerenderManifest.dynamicRoutes || Object.values(prerenderManifest.routes).some((entry) => entry.srcRoute === route.pathname);
}
/**
* Takes a route out of what the build prerenders: for a render that read the
* request, which the build would have found as it prerendered the route.
* All of its pathnames: of a route with `generateStaticParams`, the build
* keeps those that did not read it, and here the others are not rendered yet.
*/
function demoteRoute(route) {
	for (const [pathname, entry] of Object.entries(prerenderManifest.routes)) if (entry.srcRoute === route.pathname) delete prerenderManifest.routes[pathname];
	if (route.pathname in prerenderManifest.dynamicRoutes) {
		const { [route.pathname]: _, ...dynamicRoutes } = prerenderManifest.dynamicRoutes;
		prerenderManifest = {
			...prerenderManifest,
			dynamicRoutes
		};
	}
}
const manifests = [
	["routes-manifest.json", () => routesManifest],
	["prerender-manifest.json", currentPrerenderManifest],
	["preview-props.json", () => preview],
	["fallback-build-manifest.json", () => ({})],
	["build-manifest.json", () => buildManifest],
	["next-font-manifest.json", () => nextFontManifest],
	["_client-reference-manifest.js", () => ({ __RSC_MANIFEST: anyKey(() => clientReferenceManifest) })],
	["server-reference-manifest.json", () => ({
		node: serverActions,
		edge: serverActions,
		encryptionKey: ""
	})],
	["required-server-files.json", () => ({ config: nextConfig })],
	["BUILD_ID", () => routing.buildId]
];
/** A file of `.next/`, by its path, as Next's `loadManifest()` reads it. */
function loadManifest(file) {
	return manifests.find(([suffix]) => file.endsWith(suffix))?.[1]();
}
const nodeRouteDistDir = ".next/vitest-plugin-rsc-node";
const nothingPrerendered = {
	...prerenderManifest,
	routes: {},
	dynamicRoutes: {}
};
registry.node = {
	loadManifest,
	evalManifest: loadManifest,
	loadManifestFromRelativePath: ({ manifest, distDir }) => distDir === ".next/vitest-plugin-rsc-node" && manifest === "prerender-manifest.json" ? nothingPrerendered : loadManifest(manifest),
	evalManifestFromRelativePath: ({ manifest }) => loadManifest(manifest)
};
//#endregion
//#region src/nextjs/cache.ts
let generation$1 = 0;
/** The directory of the build on the server's disk, `/.next/<generation>`. */
const buildDir = () => `/.next/${generation$1}`;
registry.cacheGeneration = () => generation$1;
registry.buildDir = buildDir;
let current;
let CurCacheHandler;
let loading;
const handlerOf = (module) => {
	const handler = module.default || module;
	return handler.default || handler;
};
/**
* Loads the cache handlers that `next.config` names, as Next's server does
* before its first request: `cacheHandler`, the class of the handler of this
* cache, and `cacheHandlers`, the handler of each kind of `"use cache"`.
* Without them, Next's own handlers keep the entries in memory.
*/
function loadCacheHandlers() {
	loading ??= (async () => {
		if (cacheHandler) CurCacheHandler = handlerOf(await cacheHandler());
		initializeCacheHandlers(nextConfig.cacheMaxMemorySize);
		await registerCustomCacheHandlers(async () => {
			for (const [kind, load] of Object.entries(cacheHandlers)) setCacheHandler(kind, handlerOf(await load()));
		});
	})();
	return loading;
}
/**
* Puts the cache of the server back in the global Next reads it from. Next's
* route module leaves one of its own there. A request that was left can end
* long after its test: the cache is the one of now, not of that request.
*/
function restoreIncrementalCache() {
	globalThis.__incrementalCache = current;
}
/**
* Gives a request the cache of the server, with the options that
* `getIncrementalCache()` of Next's server passes. Without headers it is the
* cache between requests, for a test that calls a cached function itself.
*/
function shareIncrementalCache(headers = new Headers()) {
	const cache = new IncrementalCache({
		fs: nodeFs,
		serverDistDir: `${buildDir()}/server`,
		dev: false,
		minimalMode: false,
		flushToDisk: true,
		maxMemoryCacheSize: 0,
		requestHeaders: Object.fromEntries(headers),
		allowedRevalidateHeaderKeys: nextConfig.experimental.allowedRevalidateHeaderKeys,
		fetchCacheKeyPrefix: `${nextConfig.experimental.fetchCacheKeyPrefix ?? ""}${generation$1}`,
		previewProps: preview,
		CurCacheHandler,
		prerenderManifest
	});
	const set = cache.set.bind(cache);
	cache.set = ((...args) => {
		keptAsBuilt(args[0], args[1], args[2], generation$1);
		return set(...args);
	});
	globalThis.__incrementalCache = current = cache;
}
/**
* Makes the server forget which tags were revalidated, and what it has
* cached: the entries are on the server's disk, which `cleanup()` empties
* after this. The generation keeps a cached function that was still running
* when its test ended from being found under its key. An app's own
* `cacheHandler` keeps the prerendered pages and route handlers where it
* does, under their pathnames: those are expired as `revalidatePath("/",
* "layout")` expires them, by the tag each of them has for the root layout.
* What the build prerenders stays: that is the app's code (build-output.ts).
*/
async function resetCaches() {
	tagsManifest.clear();
	forgetBuilt();
	generation$1++;
	shareIncrementalCache();
	if (!CurCacheHandler || !hasPrerenders()) return;
	const stored = realNow();
	while (realNow() === stored) await new Promise((resolve) => nativeSetTimeout$1(resolve, 1));
	await current.revalidateTag(`${NEXT_CACHE_IMPLICIT_TAG_ID}/layout`);
}
const realNow = Date.now.bind(Date);
const nativeSetTimeout$1 = globalThis.setTimeout;
const hasPrerenders = () => Object.keys(prerenderManifest.routes).length > 0 || Object.keys(prerenderManifest.dynamicRoutes).length > 0;
shareIncrementalCache();
//#endregion
//#region src/nextjs/node-server.ts
const nativeSetTimeout = globalThis.setTimeout;
const leftBeforeSent = () => new DOMException("The page was left before the server had sent it.", "AbortError");
/** The `http.IncomingMessage` of a request: a stream of its body, with what Next reads of it. */
function createNodeRequest(request) {
	const url = new URL(request.url);
	const { body } = request;
	const stream = body instanceof Uint8Array ? Readable.from([body]) : body && Readable.fromWeb(body);
	return Object.assign(stream || Readable.from([]), {
		method: request.method,
		url: url.pathname + url.search,
		headers: {
			host: url.host,
			...toNodeOutgoingHttpHeaders(request.headers)
		},
		httpVersion: "1.1",
		socket: { encrypted: url.protocol === "https:" }
	});
}
/**
* The `http.ServerResponse` of a request, which is Next's own stand-in for
* one, and the `Response` the browser gets of it: once its head is there, while
* Next goes on to write the body.
*
* A request that is left before its head has no response. It lasts until
* Next's handler is done with it, which can be much later, when the data it
* waited for comes: its stores have to be there until then.
*/
function createNodeResponse(request) {
	let controller;
	let headSent = false;
	let wrote = false;
	let finished = false;
	let cancelled = false;
	let sendHead;
	const head = new Promise((resolve) => sendHead = resolve).then(() => headSent = true);
	const encoder = new TextEncoder();
	const body = new ReadableStream({
		start: (c) => void (controller = c),
		cancel() {
			cancelled = true;
			res.destroy();
		}
	});
	const res = new MockedResponse({ resWriter(chunk) {
		if (res.destroyed) return false;
		sendHead();
		wrote = headSent = res.headersSent = true;
		controller.enqueue(typeof chunk === "string" ? encoder.encode(chunk) : new Uint8Array(chunk));
		return true;
	} });
	const appendHeader = res.appendHeader.bind(res);
	res.appendHeader = (name, value) => name.toLowerCase() === "location" && res.getHeader(name) === value ? res : appendHeader(name, value);
	res._writableState.autoDestroy = false;
	res.on("finish", () => {
		finished = headSent = true;
		Object.defineProperty(res, "writableFinished", {
			value: true,
			configurable: true
		});
		sendHead();
		controller.close();
		nativeSetTimeout(() => res.destroy());
	});
	let failure;
	res.on("error", (error) => failure ??= error);
	res.on("close", () => {
		if (headSent && !finished && !cancelled) controller.error(failure ?? leftBeforeSent());
	});
	res.hasStreamed.catch(() => {});
	const { signal } = request;
	const leave = () => res.destroy();
	signal?.addEventListener("abort", leave, { once: true });
	res.once("close", () => signal?.removeEventListener("abort", leave));
	const response = (written) => {
		const sent = head.then(() => {
			const empty = finished && !wrote || [
				101,
				204,
				205,
				304
			].includes(res.statusCode);
			return new registry.Response(empty ? null : body, {
				status: res.statusCode,
				statusText: res.statusMessage,
				headers: fromNodeOutgoingHttpHeaders(res.getHeaders())
			});
		});
		const settled = written.then(() => {
			if (headSent) return sent;
			res.destroy();
			throw failure ?? leftBeforeSent();
		}, (error) => {
			if (!headSent) {
				res.destroy();
				throw error;
			}
			res.destroy(error ?? /* @__PURE__ */ new Error("The request handler failed."));
			return sent;
		});
		return Promise.race([sent, settled]);
	};
	return {
		res,
		response
	};
}
const staticToDynamic = "Page changed from static to dynamic at runtime ";
const isPrerenderBailout = (error) => isDynamicServerError(error) || error instanceof Error && error.message.startsWith(staticToDynamic);
const prerenders = [];
const routerServerContexts = Symbol.for("@next/router-server-methods");
globalThis[routerServerContexts] = { "": { logErrorWithOriginalStack(error) {
	const prerender = prerenders.at(-1);
	if (!isPrerenderBailout(error)) console.error(error);
	else if (prerender) prerender.bailouts++;
} } };
/**
* Counts the bail-outs that Next's handler reports for the prerender that
* starts now: also those it answers with its error page itself, where its
* render of a page recovers from the error (`app-page-runtime.js:1133-1224`).
* The function it returns ends the count and answers it, once: a count that
* stays would get the bail-outs of the prerenders after it.
*/
function countBailouts() {
	const prerender = { bailouts: 0 };
	prerenders.push(prerender);
	return () => {
		const at = prerenders.lastIndexOf(prerender);
		if (at !== -1) prerenders.splice(at, 1);
		return prerender.bailouts;
	};
}
function requestMetaOf(request, routed = {}) {
	return {
		...routed.params && { params: routed.params },
		...routed.query && { query: routed.query },
		initURL: request.url,
		initProtocol: new URL(request.url).protocol.slice(0, -1)
	};
}
/**
* One request, by the request handler Next's build makes for its route:
* `templates/app-page-runtime` for a page and `templates/app-route` for a
* route handler, as `next start` calls them.
*/
async function handleRequest$1(request, context, handler, routed, { statusCode, headers } = {}) {
	const { res, response } = createNodeResponse(request);
	if (statusCode !== void 0) res.statusCode = statusCode;
	headers?.forEach((value, name) => {
		if (name !== "set-cookie") res.setHeader(name, value);
	});
	return response(handler(createNodeRequest(request), res, {
		waitUntil: context.waitUntil,
		requestMeta: {
			...requestMetaOf(request, routed),
			incrementalCache: globalThis.__incrementalCache
		}
	}).finally(restoreIncrementalCache));
}
//#endregion
//#region src/nextjs/ssr.ts
registry.ssr = appPageModule;
registerModuleLoader("ssr");
const routes$1 = new Map(routes.filter((route) => !route.component).map((route) => [route.page, route]));
const componentRoutes = new Map(routes.filter((route) => route.component && !route.layouts).map((route) => [route.pathname, route]));
const componentLayoutRoutes = new Map(routes.filter((route) => route.layouts).map((route) => [route.page, route]));
const notFoundPage = "/_not-found/page";
function appQuery(query) {
	const result = Object.create(null);
	for (const [name, value] of query) {
		if (normalizeNextQueryParam(name) !== null) continue;
		result[name] = name in result ? [result[name], value].flat() : value;
	}
	return result;
}
function searchOf(query) {
	const search = new URLSearchParams();
	for (const [name, value] of Object.entries(query)) {
		if (name === NEXT_RSC_UNION_QUERY) continue;
		for (const item of [value].flat()) search.append(name, item);
	}
	return search.toString();
}
const paramMatchers = /* @__PURE__ */ new Map();
function paramsOf(route, pathname) {
	let match = paramMatchers.get(route);
	if (!match) {
		const { re, groups } = getRouteRegex(route);
		match = getRouteMatcher({
			re: new RegExp(re.source, "i"),
			groups
		});
		paramMatchers.set(route, match);
	}
	try {
		return match(pathname) || void 0;
	} catch {
		return;
	}
}
function withoutBasePath(pathname) {
	const { basePath } = routing;
	return basePath && pathname.startsWith(basePath) ? pathname.slice(basePath.length) || "/" : pathname;
}
const setTimeout = globalThis.setTimeout;
const clearTimeout = globalThis.clearTimeout;
const now = performance.now.bind(performance);
let queue = Promise.resolve();
let queued = 0;
let requestQueued = Promise.withResolvers();
const nextRequest = () => queued > 0 ? Promise.resolve() : requestQueued.promise;
const rendering = /* @__PURE__ */ new Set();
let generation = 0;
const backgroundWorkTimeout = 1e3;
const backgroundWork = /* @__PURE__ */ new Set();
const unanswered = /* @__PURE__ */ new Map();
const settleTimeout = 5e3;
function streamOf(body) {
	return new ReadableStream({ start(controller) {
		if (body) controller.enqueue(body);
		controller.close();
	} });
}
function handleRequest(request, { nested = false, unrouted = "not-found", opened, pageLoad = false } = {}) {
	if (nested) return untilAnswered(request, handle(request, unrouted, true, opened, pageLoad)).then(({ response }) => response);
	const requested = generation;
	queued++;
	requestQueued.resolve();
	const timing = registry.requestTimings && timingOf(request);
	if (timing) registry.requestTimings.push(timing);
	const result = queue.then(() => {
		if (requested !== generation) throw new DOMException("The page was left before the server responded.", "AbortError");
		queued--;
		requestQueued = Promise.withResolvers();
		if (timing) timing.started = performance.now();
		const handled = untilAnswered(request, handle(request, unrouted, false, opened, pageLoad));
		if (timing) handled.then(({ finished }) => {
			timing.answered = performance.now();
			const record = () => timing.finished = performance.now();
			finished.then(record, record);
		}, () => {});
		return handled;
	});
	queue = result.then(({ finished }) => finished, () => {});
	return result.then(({ response }) => response);
}
function timingOf(request) {
	const { headers } = request;
	const kind = headers.has("next-action") ? "action" : headers.has("rsc") ? "flight" : "page";
	return {
		method: request.method,
		url: request.url,
		kind,
		queued: performance.now()
	};
}
function untilAnswered(request, handled) {
	const settled = handled.then(() => {}, () => {});
	unanswered.set(settled, `${request.method} ${new URL(request.url).pathname}`);
	settled.then(() => unanswered.delete(settled));
	return handled;
}
async function stopResponses(written) {
	await Promise.race([written, new Promise((resolve) => setTimeout(resolve, 100))]);
	for (const stop of rendering) stop();
	rendering.clear();
}
async function untilDone(work, deadline) {
	let done = true;
	for (let waiting = [...work()]; waiting.length > 0 && done; waiting = [...work()]) {
		let timeout;
		done = await Promise.race([Promise.all(waiting).then(() => true), new Promise((resolve) => timeout = setTimeout(resolve, Math.max(0, deadline - now()), false))]);
		clearTimeout(timeout);
	}
	return done;
}
/**
* Ends the requests the server is still handling, when a page is left.
*
* A request that has its answer is writing the body: a short wait, then a
* stop. A test can end while a page streams, on data that will never come.
*
* A request that has no answer yet runs code of the app, like a Server Action
* or a route handler, and nothing can stop that. So it is waited for, and
* then for the body it writes. So is what requests do after their response,
* like `after()`. What comes next is not to run while any of that still reads
* or sets the stores of a request, which would be the ones of the requests
* that come next. A request that is sent in the meantime waits for all of
* that, and is dropped: it is one of the page that was left.
*/
async function settleRequests() {
	generation++;
	const written = queue;
	const settled = Promise.withResolvers();
	queue = settled.promise;
	queued = 0;
	const waited = requestQueued;
	requestQueued = Promise.withResolvers();
	const deadline = now() + settleTimeout;
	try {
		await stopResponses(written);
		if (unanswered.size > 0) {
			if (!await untilDone(() => unanswered.keys(), deadline)) {
				console.warn(`vitest-plugin-rsc: the server was still handling ${[...unanswered.values()].join(", ")} ${settleTimeout / 1e3}s after the page was left. What comes next runs anyway. Until that request is done, its code and the requests that come next can read and set each other's cookies, headers and other values of a request.`);
				unanswered.clear();
			}
			await stopResponses(new Promise(() => {}));
		}
		const worked = await untilDone(() => backgroundWork, deadline);
		waited.resolve();
		if (!worked) {
			backgroundWork.clear();
			console.warn(`vitest-plugin-rsc: \`after()\` or \`waitUntil()\` work of a request was still running ${settleTimeout / 1e3}s after a page was left. What comes next runs anyway, and that work may read the stores of the requests that come next.`);
		}
	} finally {
		generation++;
		queued = 0;
		waited.resolve();
		requestQueued.resolve();
		requestQueued = Promise.withResolvers();
		settled.resolve();
	}
}
function nodeRouteFor(opened, matched) {
	const node = opened?.node;
	if (!node) return void 0;
	if (!node.layouts) return componentRoutes.get(matched?.pathname ?? "/") ?? componentRoutes.get("/");
	const withLayouts = componentLayoutRoutes.get(matched?.page ?? "");
	if (!withLayouts) throw new Error(`vitest-plugin-rsc: \`layouts: true\` renders a node in place of the \`page\` file of its \`url\`, and the app has none for ${opened.pathname}.`);
	return withLayouts;
}
const verdicts = /* @__PURE__ */ new Map();
function verdictOf(route) {
	let verdict = verdicts.get(route.page);
	if (!verdict) {
		const endScope = registry.enterRequestScope();
		verdict = registry.prerenderVerdict(route).finally(endScope);
		verdicts.set(route.page, verdict);
		verdict.catch(() => verdicts.delete(route.page));
	}
	return verdict;
}
const recorded = /* @__PURE__ */ new Set();
async function recordVerdict(route) {
	const verdict = await verdictOf(route);
	if (recorded.has(route.page)) return;
	recorded.add(route.page);
	recordRoute(route, verdict);
}
async function isUnlisted(route, pathname) {
	if (recorded.has(route.page)) return prerenderManifest.dynamicRoutes[route.pathname]?.fallback === false && !(pathname in prerenderManifest.routes);
	const verdict = await verdictOf(route);
	return verdict?.fallback === false && !verdict.pathnames.includes(pathname);
}
async function prerenderFirst(route, scope, respond) {
	if (!route || !isPrerendered(route)) return respond();
	const endPrerender = scope.enterInner();
	const bailouts = countBailouts();
	try {
		const response = await respond();
		const bailedOut = bailouts() > 0;
		if (response.status !== 500 || !bailedOut) return response;
		await response.body?.cancel();
	} catch (error) {
		bailouts();
		if (!isPrerenderBailout(error)) throw error;
	}
	endPrerender();
	demoteRoute(route);
	return respond();
}
async function serverActionsOf(request) {
	const own = await registry.ownServerAction;
	const ids = new Set(own ? [own] : []);
	for (const id of await actionIdsOf(request)) if (await registry.hasServerAction(id)) ids.add(id);
	return ids;
}
function enterScope(waited) {
	const endScope = registry.enterRequestScope();
	const background = [];
	const waitUntil = (promise) => {
		background.push(promise);
		const work = promise.then(() => {}, () => {});
		backgroundWork.add(work);
		work.then(() => backgroundWork.delete(work));
	};
	const backgroundSettled = async () => {
		for (let settled = 0; settled < background.length;) {
			const waiting = background.slice(settled);
			settled = background.length;
			await Promise.allSettled(waiting);
		}
	};
	const inner = [];
	const enterInner = () => {
		const endInner = registry.enterRequestScope();
		inner.push(endInner);
		return endInner;
	};
	const endAll = () => {
		for (const endInner of inner) endInner();
		endScope();
	};
	const end = async () => {
		await Promise.race([backgroundSettled(), waited().then(() => new Promise((resolve) => setTimeout(resolve, backgroundWorkTimeout)))]);
		endAll();
	};
	return {
		waitUntil,
		end,
		endScope: endAll,
		enterInner
	};
}
async function handle(received, unrouted, nested, openedByRequest, pageLoad) {
	const request = incoming(received);
	const url = new URL(request.url);
	const opened = openedByRequest === null ? void 0 : openedByRequest ?? openedAt(url);
	const scope = enterScope(nested ? () => Promise.resolve() : nextRequest);
	registry.openedByRequest.run(opened, () => {});
	const context = { waitUntil: scope.waitUntil };
	const endRequest = scope.end;
	try {
		let { body } = request;
		let middlewareBody;
		if (body instanceof ReadableStream) [middlewareBody, body] = body.tee();
		else middlewareBody = streamOf(body);
		let responded;
		let { headers } = request;
		const invokeMiddleware = async (target) => {
			const middlewareScope = enterScope(() => Promise.resolve());
			let response;
			try {
				response = await (await registry.loadMiddleware())({
					...request,
					url: target.url.href,
					headers: target.headers,
					body: target.requestBody
				}, {
					waitUntil: middlewareScope.waitUntil,
					signal: request.signal
				});
			} catch (error) {
				if (request.signal?.aborted) throw error;
				console.error(error);
				responded = new registry.Response("Internal Server Error", { status: 500 });
				return { bodySent: true };
			} finally {
				await middlewareScope.end();
			}
			const result = middlewareResult(response, target.headers, target.url);
			if (result.bodySent) responded = response;
			else headers = result.requestHeaders ?? headers;
			return result;
		};
		const proxy = opened?.proxy ?? true;
		await loadCacheHandlers();
		const resolved = await resolve(request, middlewareBody, invokeMiddleware, proxy);
		shareIncrementalCache(headers);
		const routedHeaders = resolved.resolvedHeaders ?? new Headers();
		if (responded) return finishWithBody(request, responded, endRequest);
		const redirect = redirectStatus(resolved);
		if (redirect !== void 0) return finishWithBody(request, new registry.Response(null, {
			status: redirect,
			headers: routedHeaders
		}), endRequest);
		if (resolved.externalRewrite) {
			const hasBody = request.method !== "GET" && request.method !== "HEAD";
			return finishWithBody(request, await registry.network(resolved.externalRewrite, {
				method: request.method,
				headers,
				body: hasBody ? await new registry.Response(body).arrayBuffer() : void 0,
				signal: request.signal
			}), endRequest, routedHeaders);
		}
		const matched = routes$1.get(routing.outputs[resolved.resolvedPathname ?? ""] ?? "");
		const component = nodeRouteFor(opened, matched);
		if (!matched && !component && unrouted === "pass") return { finished: endRequest() };
		const page = component?.page ?? matched?.page ?? notFoundPage;
		const entry = component?.component ?? page;
		const routed = {
			...request,
			headers,
			body
		};
		const target = resolved.invocationTarget;
		const query = target && appQuery(Object.entries(target.query));
		const rewrittenPath = target !== void 0 && target.pathname !== url.pathname;
		const rewrittenQuery = query !== void 0 && searchOf(query) !== searchOf(appQuery(url.searchParams));
		const namesParam = [...url.searchParams.keys()].some((name) => normalizeNextQueryParam(name) !== null);
		const requestMeta = {
			params: target && matched?.pathname.includes("[") ? paramsOf(matched.pathname, withoutBasePath(target.pathname)) : void 0,
			query: rewrittenPath || rewrittenQuery || namesParam ? query : void 0
		};
		if (target && query && isRSCRequestHeader(headers.get(RSC_HEADER) ?? void 0)) {
			if (rewrittenPath) routedHeaders.set(NEXT_REWRITTEN_PATH_HEADER, withoutBasePath(target.pathname));
			if (rewrittenQuery && !routedHeaders.has(NEXT_REWRITTEN_QUERY_HEADER)) routedHeaders.set(NEXT_REWRITTEN_QUERY_HEADER, searchOf(query));
		}
		const prerenders = build === "production" && !component && matched && matched.page !== notFoundPage ? matched : void 0;
		const prefetch = prerenders?.kind === "page" && headers.get(NEXT_ROUTER_PREFETCH_HEADER) === "1" && isRSCRequestHeader(headers.get(RSC_HEADER) ?? void 0);
		if (prerenders && !prefetch) await recordVerdict(prerenders);
		if (prerenders && isPrerendered(prerenders) && request.method !== "GET" && request.method !== "HEAD" && !getIsPossibleServerAction({
			method: request.method,
			headers
		})) return finishWithBody(request, new registry.Response("Method Not Allowed", {
			status: 405,
			headers: { allow: "GET, HEAD" }
		}), endRequest, routedHeaders);
		const renderPage = async (page, entry, meta = requestMeta) => {
			setServerActions(await serverActionsOf(routed));
			const inline = !isRSCRequestHeader(headers.get(RSC_HEADER) ?? void 0);
			const files = component ? opened?.node?.files ?? [] : [];
			if (pageLoad && inline) await registry.preloadRoute(entry, files, request.signal);
			const [stylesheets, { handler, routeModule }] = await Promise.all([registry.loadStylesheets(entry, inline, files), registry.loadAppPage(entry)]);
			setStylesheets(stylesheets);
			if (component) routeModule.distDir = nodeRouteDistDir;
			const statusCode = page === notFoundPage ? 404 : void 0;
			const respond = () => handleRequest$1(routed, context, handler, meta, {
				statusCode,
				headers: routedHeaders
			});
			if (page === notFoundPage) return respond();
			if (prefetch) return withoutRoute(prerenders, respond);
			return prerenderFirst(prerenders, scope, respond);
		};
		const renderNotFound = async () => finishWithBody(request, await renderPage(notFoundPage, notFoundPage, {}), endRequest, cookiesOf(routedHeaders));
		if (!component && matched?.kind === "route") {
			const handler = await registry.loadRouteHandler(page);
			let response;
			try {
				response = await prerenderFirst(prerenders, scope, () => handleRequest$1(routed, context, handler, requestMeta, { headers: routedHeaders }));
			} catch (error) {
				if (registry.isNoFallbackError(error)) return renderNotFound();
				if (!prerenders || request.signal?.aborted) throw error;
				response = new registry.Response(null, { status: 500 });
			}
			if (prerenders && !(response.status < 400 || response.status === 404)) demoteRoute(prerenders);
			return finishWithBody(request, response, endRequest, cookiesOf(routedHeaders));
		}
		if (prefetch) {
			const pathname = withoutBasePath(target?.pathname ?? url.pathname);
			if (await isUnlisted(prerenders, pathname.length > 1 ? pathname.replace(/\/$/, "") : pathname)) return renderNotFound();
		}
		let response;
		try {
			response = await renderPage(page, entry);
		} catch (error) {
			if (page === notFoundPage || !registry.isNoFallbackError(error)) throw error;
			return renderNotFound();
		}
		return finishWithBody(request, response, endRequest, cookiesOf(routedHeaders));
	} catch (error) {
		scope.endScope();
		throw error;
	}
}
function cookiesOf(headers) {
	const cookies = new Headers();
	for (const cookie of headers.getSetCookie()) cookies.append("set-cookie", cookie);
	return cookies;
}
function finishWithBody(request, response, onFinish, routedHeaders) {
	let finished;
	let body = null;
	if (response.body) {
		const pipe = new TransformStream(void 0, void 0, { highWaterMark: Infinity });
		const stopping = new AbortController();
		const stop = () => stopping.abort();
		rendering.add(stop);
		body = pipe.readable;
		const source = response.body;
		finished = source.pipeTo(pipe.writable, {
			signal: stopping.signal,
			preventCancel: true
		}).catch(() => source.cancel(new DOMException("The page was left before the server had sent it.", "AbortError"))).catch(() => {}).finally(() => {
			rendering.delete(stop);
			return onFinish();
		});
	} else finished = onFinish();
	let { headers } = response;
	if (routedHeaders) {
		headers = new Headers(routedHeaders);
		response.headers.forEach((value, name) => {
			if (name === "set-cookie") headers.append(name, value);
			else headers.set(name, value);
		});
	}
	return {
		response: new registry.Response(request.method === "HEAD" ? null : body, {
			status: response.status,
			statusText: response.statusText,
			headers
		}),
		finished
	};
}
//#endregion
export { handleRequest, resetCaches, settleRequests };
