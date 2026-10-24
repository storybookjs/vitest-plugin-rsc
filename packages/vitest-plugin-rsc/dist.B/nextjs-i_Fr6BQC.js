import { r as pageReset } from "./async-local-storage-B5kOHq_J.js";
import { i as environmentModule, n as checkFetchedModules, r as createEnvironmentRunner } from "./utils-CNQf4hUJ.js";
import { i as registry, n as loadsNothing, r as openedAt } from "./registry-DPyevx_W.js";
import { s as unlinkStylesheets, t as callServerWithoutPage } from "./client-graph-BklcDKcx.js";
import { o as oncePerTestFile, r as fast } from "./built-files-CUO9Cl8u.js";
import { a as takesRequest } from "./server-in-front-B_L3eV1o.js";
import { a as streamedContentQueue, n as keepProperties, o as unloadDocument, r as loadDocument, t as documentUrl } from "./document-CRlVovHS.js";
import { r as noRouter, t as appHasNavigations } from "./host-document-DMFzTCG8.js";
import { n as recordMessageChannels, t as recordListeners } from "./leftovers-CqyF3dQx.js";
import { createElement } from "react";
//#region src/nextjs/page-store.ts
/** A name and a value: of a `cookie` header, or of a `Set-Cookie` before its first `;`. */
function pairOf(text) {
	const at = text.indexOf("=");
	return at === -1 ? ["", text.trim()] : [text.slice(0, at).trim(), text.slice(at + 1).trim()];
}
/** The name of an attribute of a `Set-Cookie`, in lower case, and its value. */
function attributeOf(text) {
	const at = text.indexOf("=");
	return at === -1 ? [text.trim().toLowerCase(), ""] : [text.slice(0, at).trim().toLowerCase(), text.slice(at + 1).trim()];
}
function expiresAt(value) {
	if (!/\d{1,2}:\d{1,2}:\d{1,2}/.test(value)) return void 0;
	if (!/jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec/i.test(value)) return void 0;
	const time = Date.parse(value);
	return Number.isNaN(time) ? void 0 : time;
}
function deletes(attributes) {
	let maxAge;
	let expires;
	for (const [name, value] of attributes.map(attributeOf)) {
		if (name === "max-age" && /^-?\d+$/.test(value)) maxAge = Number(value);
		if (name === "expires") expires = expiresAt(value) ?? expires;
	}
	if (maxAge !== void 0) return maxAge <= 0;
	return expires !== void 0 && expires <= Date.now();
}
/** The cookies as a `cookie` header, or as `document.cookie` has them. */
function serialize(cookies) {
	return Array.from(cookies, ([name, { value }]) => name ? `${name}=${value}` : value).join("; ");
}
/**
* What the browser's requests to the app carry, besides what a browser adds
* itself. One for the document, from what the test opened until the test
* ends: `cleanup()` makes a new one.
*/
var PageStore = class {
	/** The `headers` of what the test opened, until it opens something else. */
	headers = new Headers();
	/** The app's cookies, by name, with the values the server wrote. */
	cookies = /* @__PURE__ */ new Map();
	/** Sets the cookies of a `cookie` header, as a `Set-Cookie` of each would. */
	seed(cookie) {
		this.receive(cookie.split(";"));
	}
	/** Sets and deletes cookies by the `Set-Cookie` headers of a response of the app. */
	receive(setCookies) {
		for (const setCookie of setCookies) this.#set(setCookie, false);
	}
	/**
	* Sets or deletes a cookie as a script of the page does, with
	* `document.cookie`. As in a browser, a script cannot write an `HttpOnly`
	* cookie, nor change or delete one.
	*/
	write(setCookie) {
		this.#set(setCookie, true);
	}
	/** The `cookie` header of a request: empty without cookies. */
	cookieHeader() {
		return serialize(this.cookies);
	}
	/** What `document.cookie` has: the cookies that are not `HttpOnly`. */
	documentCookie() {
		return serialize(Array.from(this.cookies).filter(([, { httpOnly }]) => !httpOnly));
	}
	#set(setCookie, byScript) {
		const [pair = "", ...attributes] = setCookie.split(";");
		const [name, value] = pairOf(pair);
		if (!name && !value) return;
		const httpOnly = attributes.some((attribute) => attributeOf(attribute)[0] === "httponly");
		if (byScript && (httpOnly || this.cookies.get(name)?.httpOnly)) return;
		if (deletes(attributes)) this.cookies.delete(name);
		else this.cookies.set(name, {
			value,
			httpOnly
		});
	}
};
//#endregion
//#region src/nextjs/server-layers.ts
/**
* The rsc layer: Server Components, Server Actions, route handlers and the
* Flight encoder, see rsc.ts. The document's own module graph.
*/
function rscLayer() {
	return import("./nextjs/rsc.js");
}
let loading;
let loaded;
/**
* The ssr layer: Next's request handler and HTML renderer, see ssr.ts, with
* the rsc layer, which a request needs too. It starts to load the first time
* something asks for it: a request that the server handles, or the entry of
* the server's API as it evaluates. The server in front of the app needs
* neither layer: see server-in-front.ts. A build fetches the layer's file
* when its runner asks for it: see built-layers.ts.
*/
function ssrLayer() {
	if (!loading) {
		loading = Promise.all([rscLayer(), createEnvironmentRunner("next_ssr").import(environmentModule("next_ssr", "vitest-plugin-rsc/nextjs/ssr"))]).then(([, layer]) => loaded = layer);
		loading.catch(() => {});
	}
	return loading;
}
/** The ssr layer once it has loaded: until then there is nothing of it to settle or reset. */
function loadedSsrLayer() {
	return loaded;
}
//#endregion
//#region src/nextjs/app-requests.ts
async function handledByServer(...[request, options]) {
	const layer = loadedSsrLayer() ?? await ssrLayer();
	request.signal?.throwIfAborted();
	return layer.handleRequest(request, options);
}
const nativeFetch = registry.network;
async function networkFetch(input, init) {
	if (!init?.body && !(input instanceof Request && input.body)) return nativeFetch(input, init);
	const request = new Request(input, init);
	return nativeFetch(new Request(request, { body: await request.arrayBuffer() }));
}
function sameOriginRequest(input, init) {
	const request = input instanceof Request ? input : void 0;
	const url = new URL(request ? request.url : String(input), window.location.href);
	if (url.origin !== window.location.origin || url.protocol === "blob:") return;
	const headers = new Headers(init?.headers ?? request?.headers);
	return {
		url,
		method: (init?.method ?? request?.method ?? "GET").toUpperCase(),
		headers,
		marked: headers.has("rsc") || headers.has("next-action")
	};
}
let page;
let routerOutlivesPage = false;
/** Says which page of the app is open, by its signal, which aborts as it is left. */
function setOpenPage(signal) {
	page = signal;
}
/** Says whether the router of the pages outlives them, from now on. */
function setRouterOutlivesPage(outlives) {
	routerOutlivesPage = outlives;
}
const pageLeft = () => new DOMException("The page was left.", "AbortError");
const failsAsPageLeft = (action) => routerOutlivesPage && !action;
function ofLeftPage(action) {
	return failsAsPageLeft(action) ? Promise.reject(pageLeft()) : never();
}
function browserHeaders(headers, url, method, from, credentials = true) {
	headers.set("host", url.host);
	from.headers.forEach((value, name) => {
		if (!headers.has(name)) headers.set(name, value);
	});
	if (!headers.has("user-agent")) headers.set("user-agent", navigator.userAgent);
	if (method !== "GET" && method !== "HEAD" && !headers.has("origin")) headers.set("origin", url.origin);
	if (credentials && !headers.has("cookie")) {
		const cookie = from.cookieHeader();
		if (cookie) headers.set("cookie", cookie);
	}
	return headers;
}
function leftTheApp(url) {
	return /* @__PURE__ */ new Error(`vitest-plugin-rsc: the app navigated to another origin: ${url.href}. A browser would leave the app for it, which a test cannot do.`);
}
function unlessAborted(answer, signal, abandon) {
	return new Promise((resolve, reject) => {
		const abort = () => {
			reject(signal.reason);
			answer.catch(() => {});
			abandon(answer);
		};
		if (signal.aborted) return abort();
		signal.addEventListener("abort", abort, { once: true });
		answer.then((response) => {
			signal.removeEventListener("abort", abort);
			resolve(response);
		}, (error) => {
			signal.removeEventListener("abort", abort);
			reject(error);
		});
	});
}
async function sendRequest(request, { from, credentials = true, navigation, network, opened }) {
	let url = new URL(request.url);
	let method = request.method;
	const sent = new Headers(request.headers);
	const own = from && credentials && sent.has("cookie") ? new PageStore() : void 0;
	own?.seed(sent.get("cookie"));
	let body = request.body ? new Uint8Array(await request.arrayBuffer()) : null;
	let redirected = false;
	let redirects = 0;
	for (;;) {
		const headers = from ? browserHeaders(new Headers(sent), url, method, from, credentials) : new Headers(sent);
		const response = await unlessAborted(handledByServer({
			url: url.href,
			method,
			headers,
			body,
			signal: request.signal
		}, {
			nested: !from,
			unrouted: network ? "pass" : "not-found",
			opened: navigation === "app" ? null : redirected ? void 0 : opened,
			pageLoad: navigation === "test"
		}), request.signal, (answer) => void answer.then((late) => late?.body?.cancel()).catch(() => {}));
		if (!response) return redirected ? nativeFetch(url, {
			method,
			headers: sent,
			body,
			signal: request.signal
		}) : network();
		if (credentials) from?.receive(response.headers.getSetCookie());
		const location = response.headers.get("location");
		if (response.status >= 300 && response.status < 400 && location) {
			if (request.redirect === "manual") {
				Object.defineProperties(response, { url: { value: url.href } });
				return response;
			}
			if (request.redirect === "error") throw new TypeError("fetch failed", { cause: /* @__PURE__ */ new Error(`unexpected redirect of ${url.href} to ${location}`) });
			url = new URL(location, url);
			const { status } = response;
			if ((status === 301 || status === 302) && method === "POST" || status === 303 && method !== "GET" && method !== "HEAD") {
				method = "GET";
				body = null;
				for (const name of [
					"encoding",
					"language",
					"location",
					"type"
				]) sent.delete(`content-${name}`);
			}
			redirected = true;
			if (++redirects > 20) throw new Error(`vitest-plugin-rsc: too many redirects for ${request.url}. The last one was to ${url.href}.`);
			if (url.origin !== window.location.origin) {
				if (navigation) throw leftTheApp(url);
				sent.delete("authorization");
				return nativeFetch(url, {
					method,
					headers: sent,
					body,
					signal: request.signal
				});
			}
			if (own) {
				own.receive(response.headers.getSetCookie());
				sent.set("cookie", own.cookieHeader());
			}
			continue;
		}
		Object.defineProperties(response, {
			url: { value: url.href },
			redirected: { value: redirected }
		});
		return response;
	}
}
function withoutSetCookie(response) {
	if (!response.headers.has("set-cookie")) return response;
	const headers = new Headers(response.headers);
	headers.delete("set-cookie");
	const { status, statusText, url, redirected } = response;
	return Object.defineProperties(new Response(response.body, {
		status,
		statusText,
		headers
	}), {
		url: { value: url },
		redirected: { value: redirected }
	});
}
const appFetch = (store, network) => async (input, init) => {
	const server = !store;
	const from = store?.();
	if (server && !(input instanceof Request) && !URL.canParse(String(input))) throw new TypeError(`Failed to parse URL from ${String(input)}`, { cause: /* @__PURE__ */ new TypeError("Invalid URL") });
	const sent = sameOriginRequest(input, init);
	if (!sent) return network()(input, init);
	if (from) sent.headers.delete("cookie");
	const credentials = (init?.credentials ?? (input instanceof Request ? input.credentials : void 0)) !== "omit";
	const headers = from ? browserHeaders(new Headers(sent.headers), sent.url, sent.method, from, credentials) : sent.headers;
	if (!sent.marked && !await takesRequest({
		url: sent.url.href,
		headers
	})) return network()(input, init);
	if (server && sent.method === "GET" && sent.headers.get("rsc") === "1" && sent.headers.has("x-action-redirect") && registry.openedByRequest.getStore()?.rendersRedirect === false) return new registry.Response(null, { status: 204 });
	const spare = input instanceof Request && input.body ? input.clone() : input;
	const response = await sendRequest(server ? new registry.Request(input, init) : new Request(input, init), {
		from,
		credentials,
		network: sent.marked ? void 0 : () => network()(spare, init)
	});
	return from ? withoutSetCookie(response) : response;
};
const never = () => new Promise(() => {});
function isPrefetch(sent, init) {
	return sent.headers.has("rsc") && (sent.headers.has("next-router-prefetch") || init?.priority === "low");
}
const noPrefetch = () => new Response(null, { status: 204 });
async function heardBy(sender, response, action) {
	if (failsAsPageLeft(action)) return failsAsLeft(sender, response);
	const answered = await response.catch(() => void 0);
	if (!sender.aborted) return response;
	answered?.body?.cancel().catch(() => {});
	return ofLeftPage(action);
}
function failsAsLeft(sender, response) {
	const left = new Promise((_, reject) => sender.addEventListener("abort", () => reject(pageLeft()), { once: true }));
	left.catch(() => {});
	response.then((answered) => {
		if (sender.aborted) answered.body?.cancel().catch(() => {});
	}, () => {});
	return Promise.race([response, left]);
}
/**
* The browser's `fetch` while a browser context of the app is open: what
* Next's client router and Client Components call. `store()` is the store of
* the context, and `network()` the `fetch` the document had before it, which
* gets every request that is not the app's. Without a context, `network()`
* gets every request: code that took this `fetch` in a context has the
* document's own after it.
*
* Next marks the requests it sends for a page, with an `rsc` or a
* `next-action` header. They belong to the page that is open as they are
* sent. Its router is there only once its page is, so without a page that
* page was left, and it sends nothing more. A test asks with
* `handleRequest()`.
*/
function pageFetch(store, network) {
	const browserFetch = appFetch(() => store(), network);
	return async (input, init) => {
		if (!store()) return network()(input, init);
		const sent = sameOriginRequest(input, init);
		if (!sent?.marked) return browserFetch(input, init);
		const action = sent.headers.has("next-action");
		const sender = page;
		if (!sender || sender.aborted) return ofLeftPage(action);
		if (fast("skipPrefetch") && isPrefetch(sent, init)) return noPrefetch();
		return heardBy(sender, browserFetch(input, init), action);
	};
}
registry.fetch = appFetch(void 0, () => networkFetch);
process.env.__NEXT_PRIVATE_ORIGIN = window.location.origin;
//#endregion
//#region src/nextjs/form-submission.ts
/**
* The encoding of a submission whose navigation `source` is: the
* `formenctype` of the button that submits the form, or the `enctype` of the
* form, which `form.submit()` submits itself.
*/
function enctypeOf(source) {
	if (source instanceof HTMLFormElement) return source.enctype;
	if (source instanceof HTMLButtonElement || source instanceof HTMLInputElement) {
		if (source.hasAttribute("formenctype")) return source.formEnctype;
		if (source.form) return source.form.enctype;
	}
	return "application/x-www-form-urlencoded";
}
/**
* The body of a form with the entries of `formData`, in the encoding
* `enctype`. A `Blob` with the type as a browser sends it, without a charset:
* Next's server tells a form from a Server Action by the exact type.
*/
function formBody(formData, enctype) {
	if (enctype === "multipart/form-data") return formData;
	const entries = Array.from(formData, ([name, value]) => [name, typeof value === "string" ? value : value.name]);
	if (enctype === "text/plain") return new Blob([entries.map(([name, value]) => `${name}=${value}\r\n`).join("")], { type: "text/plain" });
	return new Blob([String(new URLSearchParams(entries))], { type: "application/x-www-form-urlencoded" });
}
//#endregion
//#region src/nextjs/downloads.ts
/**
* The name a browser saves the answer to a navigation as, or none when it
* shows the answer. `requested` is the navigation's `downloadRequest`: the
* `download` attribute of a link, `""` without a value.
*/
function downloadName(response, requested) {
	const disposition = response.headers.get("content-disposition") ?? "";
	const type = /^\s*([^\s;=]*)\s*(?:;|$)/.exec(disposition)?.[1]?.toLowerCase();
	if (requested === null && (!type || type === "inline")) return void 0;
	const fromUrl = decode(percentDecoded(new URL(response.url).pathname.split("/").pop()), "utf-8");
	return filenameOf(disposition) || requested || fromUrl || "download";
}
function filenameOf(disposition) {
	const parameters = /* @__PURE__ */ new Map();
	for (const [, name, value] of disposition.matchAll(/;\s*([^\s=;]+)\s*=\s*("(?:[^"\\]|\\.)*"|[^;]*)/g)) {
		const unquoted = value.startsWith("\"") ? value.slice(1, -1).replace(/\\(.)/g, "$1") : value;
		if (!parameters.has(name.toLowerCase())) parameters.set(name.toLowerCase(), unquoted.trim());
	}
	const extended = /^([\w!#$%&+^`{}~-]+)'[^']*'(.*)$/.exec(parameters.get("filename*") ?? "");
	if (extended) {
		const decoded = decode(percentDecoded(extended[2]), extended[1]);
		if (decoded) return decoded;
	}
	const plain = parameters.get("filename");
	if (!plain) return void 0;
	const text = decode(Uint8Array.from(plain, (char) => char.charCodeAt(0) & 255), "utf-8") ?? plain;
	return /^[\x20-\x7e]*%[\da-f]{2}[\x20-\x7e]*$/i.test(text) ? decode(percentDecoded(text), "utf-8") ?? text : text;
}
function percentDecoded(text) {
	const bytes = [];
	for (let at = 0; at < text.length; at++) {
		const escaped = /^%([\da-f]{2})/i.exec(text.slice(at, at + 3));
		if (escaped) {
			bytes.push(parseInt(escaped[1], 16));
			at += 2;
		} else bytes.push(text.charCodeAt(at) & 255);
	}
	return Uint8Array.from(bytes);
}
function decode(bytes, charset) {
	try {
		return new TextDecoder(charset, { fatal: true }).decode(bytes);
	} catch {
		return;
	}
}
/**
* Hands the answer to the browser as a download, as `name`: the browser
* saves the body of a Blob URL that an `<a download>` links, and the URL goes
* once it has. An answer that is not ok is no file, as in a browser.
*/
async function download(response, name, signal) {
	if (!response.ok) {
		await response.body?.cancel();
		throw new Error(`vitest-plugin-rsc: the download of ${response.url} failed: it responded with ${response.status}. A browser saves no file for it.`);
	}
	const blob = await response.blob();
	signal.throwIfAborted();
	const url = URL.createObjectURL(blob);
	try {
		const link = document.createElement("a");
		link.href = url;
		link.download = name;
		link.click();
	} finally {
		URL.revokeObjectURL(url);
	}
}
//#endregion
//#region src/nextjs/page.ts
const startTimeout = 2e4;
const setTimeout = globalThis.setTimeout;
const clearTimeout = globalThis.clearTimeout;
/**
* A page of the app, from the first line of its load until it is left, with
* the node of `renderServer()` on it, and where it reports its errors. Its
* load makes it part by part, and each part that would outlive the page says
* how it is released. Leaving stops the load at once, and releases the
* parts, the last first.
*/
var Page = class {
	errors;
	nodeOnPage;
	inKeptApp;
	#load = new AbortController();
	/** Aborts as the page is left: what the load does takes it. */
	signal = this.#load.signal;
	#releases = [];
	#started;
	#stopped = () => {};
	#left;
	constructor(errors, nodeOnPage, inKeptApp = false) {
		this.errors = errors;
		this.nodeOnPage = nodeOnPage;
		this.inKeptApp = inKeptApp;
	}
	/** Whether the page is open: from when its client starts until it is left. */
	get open() {
		return this.#started !== void 0 && !this.signal.aborted;
	}
	/**
	* Runs `release` as the page is left: before what the load made before
	* it. As `defer()` of a `DisposableStack`.
	*/
	defer(release) {
		this.#releases.push(release);
	}
	/**
	* Opens the page: its client starts. Leaving waits for `started` to
	* settle, at most `startTimeout`, before it releases what the page holds.
	* `stopped` runs once the start is over for the page: once `started` has
	* settled, or once leaving stops waiting for it.
	*/
	starts(started, stopped) {
		this.#started = started.then(stopped, stopped);
		this.#stopped = stopped;
	}
	/**
	* Leaves the page: `by` is what leaves it, for its node. Stops its load at
	* once. Resolves once what the page holds is released, or rejects with the
	* first error of a release, after every release has run. A page still
	* starting after `startTimeout` is released once it has stopped, and
	* `reportError()` gets that error: leaving resolves without it. Once:
	* leaving it again gets the same promise.
	*/
	leave(by) {
		return this.#left ??= this.#leave(by);
	}
	async #leave(by) {
		if (this.inKeptApp && this.open) dispatchPageTransition("pagehide");
		this.#load.abort(new DOMException("The page was left before it had loaded.", "AbortError"));
		this.nodeOnPage?.left(by);
		const released = (this.#started ?? Promise.resolve()).then(() => this.#release());
		let timeout;
		const stopped = await Promise.race([released.then(() => true, () => true), new Promise((resolve) => timeout = setTimeout(resolve, startTimeout, false))]);
		clearTimeout(timeout);
		if (stopped) return released;
		console.warn(`vitest-plugin-rsc: the page that was left was still loading its client code ${startTimeout / 1e3}s later. The next page loads anyway.`);
		this.#stopped();
		released.catch(reportError);
	}
	#release() {
		let failed;
		for (const release of this.#releases.splice(0).reverse()) try {
			release();
		} catch (error) {
			failed ??= { error };
		}
		if (failed) throw failed.error;
	}
};
let current;
let kept;
/**
* Leaves the kept app, if any: its root, its module graph and what its
* modules left behind as they loaded go. Once its page is left: see
* `leavePage()`, and `leaveKeptAppWithPage()`.
*/
function leaveKeptApp() {
	const app = kept;
	kept = void 0;
	setRouterOutlivesPage(false);
	app?.leave();
}
/**
* Leaves the page of the kept app that is open, as `leavePage()` does with
* `by`, and then the kept app: a test file ends with them. The app goes also
* after a page that could not be left, and the first error rejects.
*/
async function leaveKeptAppWithPage(by) {
	let failed;
	try {
		if (current?.inKeptApp) await leavePage(by);
	} catch (error) {
		failed = { error };
	}
	try {
		leaveKeptApp();
	} catch (error) {
		failed ??= { error };
	}
	if (failed) throw failed.error;
}
function releaseAll(releases) {
	let failed;
	for (const release of releases.splice(0).reverse()) try {
		release();
	} catch (error) {
		failed ??= { error };
	}
	if (failed) throw failed.error;
}
/** The page that is open: see `Page.open`. */
function currentPage() {
	return current?.open ? current : void 0;
}
async function loadPage(url, request, from, opening) {
	const errors = opening?.errors ?? currentPage()?.errors ?? [];
	const inKeptApp = opening ? opening.inKeptApp === true : currentPage()?.inKeptApp === true;
	const leaving = leavePage(opening ? "another renderServer()" : "a page load of the app");
	const page = current = new Page(errors, opening?.nodeOnPage, inKeptApp);
	const loading = (async () => {
		await leaving;
		page.signal.throwIfAborted();
		if (!inKeptApp) leaveKeptApp();
		if (opening?.container?.hasChildNodes()) throw new Error("vitest-plugin-rsc: the container of a node has to be empty. The node is hydrated in it, and leaving the node empties it.");
		const opened = registry.opened = opening?.opened;
		if (opening) {
			from.headers = opening.headers;
			if (opening.cookie !== null) from.seed(opening.cookie);
		}
		try {
			return await openPage(page, url, request, from, opening);
		} catch (error) {
			if (opened && registry.opened === opened && !page.signal.aborted) registry.opened = void 0;
			throw error;
		}
	})();
	if (!opening?.signal) return loading;
	return unlessAborted(loading, opening.signal, () => {
		if (current === page) leavePage("the signal of renderServer()").catch(reportError);
	});
}
async function openPage(page, url, request, from, opening) {
	const { signal } = page;
	const superseded = () => signal.throwIfAborted();
	const requestDocument = async (init) => {
		try {
			const response = await sendPageLoad(url, init, {
				from,
				navigation: "test"
			}, signal);
			superseded();
			return await readDocument(response, (what) => `${what}, which is not a page to open. Use handleRequest() to assert on the response itself.`);
		} catch (error) {
			superseded();
			throw error;
		}
	};
	const { response, html, after } = "html" in request ? request : await requestDocument(request);
	superseded();
	let container = opening?.container;
	if (opening && new URL(response.url).pathname !== opening.opened.pathname) {
		registry.opened = void 0;
		container = void 0;
		opening.nodeOnPage?.replaced();
	}
	if (/^\s*<!doctype/i.test(html)) {
		container = void 0;
		if (!opening?.opened.node?.layouts) opening?.nodeOnPage?.replaced();
	}
	await loadDocument(html, response.url, container, after);
	superseded();
	const { inKeptApp } = page;
	if (inKeptApp && kept) {
		await startInKeptApp(page, kept.client);
		superseded();
		return response;
	}
	const appReleases = [];
	const deferForApp = (release) => inKeptApp ? appReleases.push(release) : page.defer(release);
	const runner = createEnvironmentRunner("react_client");
	deferForApp(() => void runner.close());
	const browserRequire = (id) => registry.loadBrowserModule?.(id) ?? loadsNothing();
	registry.browserRequire = browserRequire;
	deferForApp(() => {
		if (registry.browserRequire === browserRequire) registry.browserRequire = loadsNothing;
	});
	const leftovers = [recordListeners(window), recordMessageChannels()];
	for (const leftover of leftovers) deferForApp(() => leftover.remove());
	const loaded = () => leftovers.forEach((leftover) => leftover.stop());
	const started = (async () => {
		try {
			const client = await runner.import(environmentModule("react_client", "vitest-plugin-rsc/nextjs/client"));
			superseded();
			const { unmount, leaveApp } = await client.start(loaded, container, signal, opening?.nodeOnPage, page.errors, inKeptApp);
			page.defer(unmount);
			if (!inKeptApp) return;
			appReleases.push(leaveApp);
			const marks = Reflect.ownKeys(document).filter((key) => typeof key === "string" && (key.startsWith("__reactContainer$") || key.startsWith("_reactListening")));
			keepProperties(document, marks);
			leaveKeptApp();
			kept = {
				client,
				leave() {
					keepProperties(document);
					try {
						releaseAll(appReleases);
					} finally {
						for (const key of marks) Reflect.deleteProperty(document, key);
					}
				}
			};
			setRouterOutlivesPage(true);
		} catch (error) {
			releaseAll(appReleases);
			throw error;
		}
	})();
	page.starts(started, loaded);
	setOpenPage(signal);
	try {
		await started;
	} catch (error) {
		superseded();
		throw error;
	}
	superseded();
	return response;
}
function dispatchPageTransition(type) {
	window.dispatchEvent(new PageTransitionEvent(type, { persisted: false }));
}
async function startInKeptApp(page, client) {
	const { signal } = page;
	dispatchPageTransition("pageshow");
	const started = client.renderAgain(signal, page.errors).then(({ unmount }) => page.defer(unmount));
	page.starts(started, () => {});
	setOpenPage(signal);
	try {
		await started;
	} catch (error) {
		signal.throwIfAborted();
		throw error;
	}
}
const moduleChecks = /* @__PURE__ */ new Map();
async function sendPageLoad(url, init, sending, signal) {
	await oncePerTestFile(moduleChecks, "", checkFetchedModules);
	signal.throwIfAborted();
	return sendRequest(new registry.Request(url, {
		...init,
		signal
	}), sending);
}
async function readDocument(response, notAPage) {
	const contentType = response.headers.get("content-type") ?? "";
	if (!/^text\/html\b/i.test(contentType)) {
		await response.body?.cancel();
		const what = `${response.url} responded with ${contentType || "no content type"}`;
		throw new Error(`vitest-plugin-rsc: ${notAPage(what)}`);
	}
	return {
		response,
		html: await response.text()
	};
}
let navigating = new AbortController();
let withoutPage = new AbortController();
/**
* A navigation of the app without its router, as a browser makes it: a
* `<form>`, an `<a>` that React does not handle, `location.assign()`. The
* page that is open stays until the answer is there, and for good when the
* answer is a download (downloads.ts). Else the answer is the next page,
* which needs a page of the app to navigate in. `downloadRequest` is the
* navigation's, and `from` the store of the browser context it is in. With
* `push` the next page gets an entry of the history of its own, as after a
* link or a form in a browser. Else it takes the entry of the page, as
* after a reload or `location.replace()`.
*/
async function navigate(url, init, downloadRequest, from, push) {
	const page = currentPage();
	const signals = [page?.signal ?? withoutPage.signal];
	if (downloadRequest === null) {
		navigating.abort(new DOMException("Another navigation took the place of this one.", "AbortError"));
		navigating = new AbortController();
		signals.push(navigating.signal);
	}
	const signal = AbortSignal.any(signals);
	let loaded;
	try {
		const response = await sendPageLoad(url, init, {
			from,
			navigation: "app",
			network: downloadRequest === null ? void 0 : () => registry.network(url, {
				...init,
				signal
			})
		}, signal);
		signal.throwIfAborted();
		const name = downloadName(response, downloadRequest);
		if (name !== void 0) return await download(response, name, signal);
		if (!page) {
			await response.body?.cancel();
			throw noRouter(url);
		}
		loaded = await readDocument(response, (what) => `the app navigated to a URL that is not a page: ${what}. A browser would show it in place of the app, which a test cannot do. A route handler that answers with a file to save says so with Content-Disposition: attachment, or a link with download.`);
		signal.throwIfAborted();
	} catch (error) {
		signal.throwIfAborted();
		throw error;
	}
	const after = push ? {
		url: window.location.href,
		state: window.history.state
	} : void 0;
	await loadPage(url, {
		...loaded,
		after
	}, from);
}
let leaving = Promise.resolve();
function leavePage(by) {
	const left = current;
	current = void 0;
	withoutPage.abort(new DOMException("The test moved on before it was done.", "AbortError"));
	withoutPage = new AbortController();
	const pageLeft = left?.leave(by);
	const gone = leaving.catch(() => {}).then(async () => {
		try {
			await pageLeft;
		} finally {
			try {
				unloadDocument();
			} finally {
				try {
					await loadedSsrLayer()?.settleRequests();
				} finally {
					registry.opened = void 0;
					setOpenPage(void 0);
					globalThis.__viteRscCallServer = callServerWithoutPage;
					pageReset();
				}
			}
		}
	});
	leaving = gone;
	return gone;
}
//#endregion
//#region src/nextjs/document-loads.ts
import.meta.hot?.on("vite:beforeFullReload", ({ path }) => {
	if (reloadsDocument(path)) return leavePage("a reload of the page");
});
import.meta.hot?.on("vite:ws:disconnect", () => leavePage("a lost connection to the dev server"));
function reloadsDocument(path) {
	if (!path?.endsWith(".html") || path === "/index.html") return true;
	const pagePath = decodeURI(new URL(documentUrl()).pathname);
	const payloadPath = (import.meta.env?.BASE_URL ?? "/") + path.slice(1);
	return pagePath === payloadPath || pagePath.endsWith("/") && `${pagePath}index.html` === payloadPath;
}
/**
* What a navigation does in a browser context of the app, whose store is
* `from`. The app can leave its page without its router:
* `location.assign()`, a `<form>` or an `<a>` that React does not handle,
* Next's own fallback when a client-side navigation is not possible. For a
* browser that is a page load. Here it would replace the test with the app,
* so `navigate()` loads the page the way `renderServer()` does instead, or
* downloads what a browser would.
*/
function followNavigation(event, from) {
	const { destination, hashChange, formData, downloadRequest, navigationType, sourceElement } = event;
	if (destination.sameDocument) currentPage()?.nodeOnPage?.at(new URL(destination.url).pathname);
	if (destination.sameDocument || hashChange || !event.cancelable) return;
	const url = new URL(destination.url);
	if (downloadRequest !== null && (url.protocol === "blob:" || url.protocol === "data:")) return;
	if (destination.url === documentUrl()) return;
	if (url.origin === window.location.origin && openedAt(url)?.node) {
		event.preventDefault();
		leavePage("a navigation to the host's document").catch(() => {}).then(() => window.location.reload());
		return;
	}
	event.preventDefault();
	if (url.origin !== window.location.origin) {
		reportError(currentPage() ? leftTheApp(url) : noRouter(url));
		return;
	}
	navigate(url, {
		method: formData ? "POST" : "GET",
		headers: { accept: "text/html" },
		body: formData && formBody(formData, enctypeOf(sourceElement))
	}, downloadRequest, from, navigationType === "push").catch((error) => {
		if (!(error instanceof DOMException && error.name === "AbortError")) reportError(error);
	});
}
//#endregion
//#region src/nextjs/storage.ts
/**
* The items of the page's `localStorage` and `sessionStorage`. One for each
* browser context of the app.
*/
var PageStorage = class {
	localStorage = /* @__PURE__ */ new Map();
	sessionStorage = /* @__PURE__ */ new Map();
};
/** The items of a `Storage` of the browser's, as a map. */
function itemsOfStorage(storage) {
	return {
		get: (key) => storage.getItem(key) ?? void 0,
		set: (key, value) => storage.setItem(key, value),
		delete(key) {
			const had = storage.getItem(key) !== null;
			storage.removeItem(key);
			return had;
		},
		has: (key) => storage.getItem(key) !== null,
		clear: () => storage.clear(),
		keys: () => Array.from({ length: storage.length }, (_, index) => storage.key(index)),
		get size() {
			return storage.length;
		}
	};
}
const sources = /* @__PURE__ */ new WeakMap();
const itemsOf = (storage) => sources.get(storage)();
const storagePrototype = Object.create(Storage.prototype, {
	length: {
		get() {
			return itemsOf(this).size;
		},
		enumerable: true,
		configurable: true
	},
	...Object.getOwnPropertyDescriptors({
		key(index) {
			return [...itemsOf(this).keys()][index >>> 0] ?? null;
		},
		getItem(key) {
			return itemsOf(this).get(`${key}`) ?? null;
		},
		setItem(key, value) {
			itemsOf(this).set(`${key}`, `${value}`);
		},
		removeItem(key) {
			itemsOf(this).delete(`${key}`);
		},
		clear() {
			itemsOf(this).clear();
		}
	})
});
/**
* A `Storage` of the items that `items()` returns each time it is used. Its
* items are its properties too, as in a browser: `storage.theme`,
* `Object.keys(storage)` and `JSON.stringify(storage)` have them, and setting
* or deleting a property sets or removes an item. A name of `Storage`, like
* `key` or `length`, hides the item of that name.
*/
function storageOf(items) {
	const target = Object.create(storagePrototype);
	const isItem = (name) => typeof name === "string" && !(name in target) && items().has(name);
	const storage = new Proxy(target, {
		get: (target, name, receiver) => isItem(name) ? items().get(name) : Reflect.get(target, name, receiver),
		set(target, name, value, receiver) {
			if (typeof name !== "string" || name in target || receiver !== storage) return Reflect.set(target, name, value, receiver);
			items().set(name, `${value}`);
			return true;
		},
		has: (target, name) => isItem(name) || Reflect.has(target, name),
		deleteProperty: (target, name) => isItem(name) ? items().delete(name) : Reflect.deleteProperty(target, name),
		ownKeys: (target) => [...[...items().keys()].filter(isItem), ...Reflect.ownKeys(target)],
		getOwnPropertyDescriptor: (target, name) => isItem(name) ? {
			value: items().get(name),
			writable: true,
			enumerable: true,
			configurable: true
		} : Reflect.getOwnPropertyDescriptor(target, name),
		defineProperty(target, name, descriptor) {
			if (typeof name !== "string" || name in target) return Reflect.defineProperty(target, name, descriptor);
			if (!("value" in descriptor)) return false;
			items().set(name, `${descriptor.value}`);
			return true;
		},
		preventExtensions: () => false
	});
	sources.set(storage, items);
	return storage;
}
//#endregion
//#region src/nextjs/browser-context.ts
/** A browser context of the app: its cookie jar, the headers of its requests, and its storage. */
var BrowserContext = class {
	store = new PageStore();
	storage = new PageStorage();
};
let opened;
const saved = /* @__PURE__ */ new Map();
const patched = /* @__PURE__ */ new Set();
const savedOf = (binding) => saved.get(binding) ?? descriptorOf(Object.getPrototypeOf(binding.target), binding.name);
function savedValue(binding) {
	const descriptor = savedOf(binding);
	return descriptor?.get ? descriptor.get.call(binding.target) : descriptor?.value;
}
function descriptorOf(target, name) {
	for (; target; target = Object.getPrototypeOf(target)) {
		const descriptor = Object.getOwnPropertyDescriptor(target, name);
		if (descriptor) return descriptor;
	}
}
const fetchBinding = {
	target: globalThis,
	name: "fetch",
	own: {
		configurable: true,
		enumerable: true,
		writable: true,
		value: pageFetch(() => opened?.store, () => savedValue(fetchBinding) ?? registry.network)
	}
};
const cookieBinding = {
	target: document,
	name: "cookie",
	own: {
		configurable: true,
		get: () => opened ? opened.store.documentCookie() : savedValue(cookieBinding),
		set(cookie) {
			if (opened) opened.store.write(String(cookie));
			else savedOf(cookieBinding)?.set?.call(document, cookie);
		}
	}
};
const storageBindings = ["localStorage", "sessionStorage"].map((name) => {
	const binding = {
		target: window,
		name,
		own: void 0
	};
	const items = () => opened ? opened.storage[name] : itemsOfStorage(savedValue(binding));
	const storage = storageOf(items);
	binding.own = {
		configurable: true,
		enumerable: true,
		get: () => storage
	};
	return binding;
});
const bindings = [
	fetchBinding,
	cookieBinding,
	...[
		"cookieStore",
		"CookieStore",
		"CookieChangeEvent"
	].map((name) => ({
		target: window,
		name,
		own: void 0
	})),
	...storageBindings,
	{
		target: self,
		name: "$RC",
		own: streamedContentQueue
	}
];
function same(one, other) {
	if (!one || !other) return one === other;
	return one.get === other.get && one.set === other.set && one.value === other.value;
}
const ownOf = ({ target, name }) => Object.getOwnPropertyDescriptor(target, name);
const original = new Map(bindings.map((binding) => [binding, ownOf(binding)]));
const isDocuments = (binding, descriptor) => saved.has(binding) && same(descriptor, saved.get(binding)) || same(descriptor, original.get(binding));
const navigation = window.navigation;
const followed = (event) => {
	if (opened) followNavigation(event, opened.store);
};
/**
* Opens a browser context of the app, empty, unless one is open: the
* document has its cookies, storage, requests and navigations until
* `closeContext()`.
*/
function openContext() {
	if (opened) return opened;
	for (const binding of bindings) {
		const { target, name, own } = binding;
		const descriptor = ownOf(binding);
		if (same(descriptor, own)) continue;
		if (patched.has(binding) && !isDocuments(binding, descriptor)) continue;
		patched.delete(binding);
		saved.set(binding, descriptor);
		if (own) Object.defineProperty(target, name, own);
		else Reflect.deleteProperty(target, name);
	}
	navigation?.addEventListener("navigate", followed);
	appHasNavigations(true);
	return opened = new BrowserContext();
}
/**
* Closes the browser context that is open, and puts back what the document
* had wherever the context's own are in place. Also with none open: a patch
* over them that has gone since, like a spy that a test restored after
* `cleanup()`, put them back.
*/
function closeContext() {
	const closing = opened !== void 0;
	opened = void 0;
	navigation?.removeEventListener("navigate", followed);
	appHasNavigations(false);
	for (const binding of bindings) {
		const { target, name, own } = binding;
		const descriptor = ownOf(binding);
		if (!same(descriptor, own)) {
			if (isDocuments(binding, descriptor)) patched.delete(binding);
			else if (closing) patched.add(binding);
			continue;
		}
		patched.delete(binding);
		if (!saved.has(binding)) continue;
		const put = saved.get(binding);
		if (put) Object.defineProperty(target, name, put);
		else Reflect.deleteProperty(target, name);
	}
}
//#endregion
//#region src/nextjs/disk.ts
/** The global the disk is on. */
const diskGlobal = "__vitest_plugin_rsc_disk__";
/**
* Empties the disk, as it is before any test: nothing but `/tmp`, which
* `os.tmpdir()` names. Closes what watches a file of it, which would see the
* next test's files otherwise. Nothing to do while no module imports `fs`.
*/
function resetDisk() {
	globalThis[diskGlobal]?.reset();
}
//#endregion
//#region src/nextjs/node-on-page.ts
var NodeOnPage = class {
	#pathname;
	#version = 0;
	#waiting = /* @__PURE__ */ new Set();
	#shown = 0;
	#refresh;
	#error;
	#gone;
	constructor(pathname) {
		this.#pathname = pathname;
	}
	/**
	* Renders the node again: `swap` puts the node with the next version where
	* the server reads it, and then Next's router asks the server for the page
	* again, one request for every call. Resolves once the page has committed
	* that version or a later one, and run its effects. Rejects at once, and
	* later, when the page no longer has the node.
	*/
	rerender(swap) {
		if (this.#gone) return Promise.reject(this.#gone());
		this.#error = void 0;
		const version = ++this.#version;
		swap(version);
		const committed = new Promise((resolve, reject) => {
			this.#waiting.add({
				version,
				resolve,
				reject
			});
		});
		this.#refresh?.();
		return committed;
	}
	/** The page is at `pathname` now. At another than the node's, the node is not there. */
	at(pathname) {
		if (pathname !== this.#pathname) this.replaced();
	}
	/** From the page, in the commit that mounts the node: its router. */
	mounted(refresh) {
		if (this.#gone) return;
		const first = !this.#refresh;
		this.#refresh = refresh;
		if (first && this.#waiting.size > 0) refresh();
	}
	/**
	* From the page, from a passive effect, after the effects of the node: it
	* shows the node at `version`.
	*/
	shown(version) {
		this.#shown++;
		if (this.#gone) return;
		this.#error = void 0;
		for (const waiting of this.#waiting) {
			if (waiting.version > version) continue;
			this.#waiting.delete(waiting);
			waiting.resolve();
		}
	}
	/** From the page: the node is no longer shown. Something else may be in its place. */
	hidden() {
		this.#shown--;
		Promise.resolve().then(() => {
			if (this.#shown === 0) this.replaced();
		});
	}
	/**
	* From the root of the page: React reported an error. For a node that is
	* mounted, a boundary in it shows the error, or one around it does and the
	* node is no longer shown. One that is not mounted by the end of the commit
	* never will be: an error took its place before it hydrated.
	*/
	errored(error) {
		this.#error = error;
		Promise.resolve().then(() => {
			if (!this.#refresh) this.replaced();
		});
	}
	/** Something else is in the node's place: a page it redirected to, an error page. */
	replaced() {
		if (this.#gone) return;
		const cause = this.#error;
		const error = () => Object.assign(new Error("vitest-plugin-rsc: rerender() renders the node again in its place, and the page has something else there: an error or a not-found page, a page the node redirected to, or a route the app navigated to. Render the node with renderServer() instead.", cause === void 0 ? void 0 : { cause }), { name: "NodeReplacedError" });
		this.#leave(error, error());
	}
	/**
	* The page was left: by `cleanup()`, `unmount()`, another `renderServer()`,
	* the app or the dev server.
	*/
	left(by) {
		if (this.#gone) return;
		this.#leave(() => /* @__PURE__ */ new Error(`vitest-plugin-rsc: rerender() renders the node again on its page, which ${by} has left. Render the node with renderServer() instead.`), new DOMException(`The page was left before the node had rendered again: by ${by}.`, "AbortError"));
	}
	#leave(gone, reason) {
		this.#gone = gone;
		for (const waiting of this.#waiting) waiting.reject(reason);
		this.#waiting.clear();
	}
};
//#endregion
//#region src/nextjs/index.ts
ssrLayer();
await rscLayer();
/**
* Sends a request to the Next.js server of the app, like `fetch` from a page
* of the app would. Use it to assert on a response itself: its status, its
* headers, its HTML or Flight body.
*
* The request carries the app's cookies and the `headers` of what
* `renderServer()` opened, under its own. A `cookie` header is sent instead
* of the app's cookies, with this request and the redirects it follows. The
* cookies the server sets are the app's from then on:
* `response.headers.getSetCookie()` has them, where the `fetch` of the page
* does not show them.
* One to the pathname of what `renderServer()` opened is that page's, as a
* `fetch` of the page is: it gets the route of the node, and skips the proxy
* if the page does.
*
* Ask the server yourself with this, not with `fetch`: a `fetch` with Next's
* `rsc` or `next-action` header is Next's. It is the page's that is open as
* it is sent, and it never settles once that page is left, or without one.
*/
function handleRequest(input, init) {
	const request = new registry.Request(input, init);
	return sendRequest(request, {
		from: openContext().store,
		credentials: request.credentials !== "omit"
	});
}
let serverActionKeys = 0;
/**
* Runs `action` as a Server Action of the page at `url`, the way Next runs
* one: in the request of the action, where `cookies()` can be set and
* `redirect()`, `refresh()` and `after()` work. Resolves with what it
* returns, and rejects with what it throws, also the error of a `redirect()`.
* Its arguments and its result are the test's own, not sent through Flight.
*
* It sends a Server Action request like the one of Next's router, to a route
* at `url` that renders nothing, and opens no page: there is no app to start.
* After a `redirect()` no page renders: open the page the action redirects
* to in the test. A page that is open stays open. The request carries the app's cookies, the `headers` of
* what `renderServer()` opened and the ones passed here, and the cookies the
* action sets are the app's from then on. For code that a Server Action
* calls; test a form of a page through the page.
*
* The function runs in the request, so it cannot send a request to the app
* itself, which would wait for this one: call the app's code instead.
*/
async function runInServerAction(action, options = {}) {
	const from = openContext().store;
	const url = new URL(options.url ?? "/", window.location.origin);
	if (url.origin !== window.location.origin) throw new Error(`vitest-plugin-rsc: a Server Action is of a page of the app, not of ${url.href}`);
	const { runInServerActionOfTest } = await import("./nextjs/server-action.js");
	const key = serverActionKeys++;
	const ran = {};
	registry.serverActions.set(key, async () => {
		try {
			ran.outcome = { value: await action() };
		} catch (error) {
			ran.outcome = { error };
			throw error;
		}
	});
	try {
		const headers = new Headers(options.headers);
		headers.set("accept", "text/x-component");
		headers.set("content-type", "text/plain;charset=UTF-8");
		headers.set("next-action", serverActionId(runInServerActionOfTest));
		const response = await sendRequest(new registry.Request(url, {
			method: "POST",
			headers,
			body: JSON.stringify([key]),
			redirect: "manual"
		}), {
			from,
			opened: {
				pathname: url.pathname,
				proxy: options.proxy ?? false,
				node: {
					ui: null,
					layouts: false,
					files: []
				},
				rendersRedirect: false
			}
		});
		if (ran.outcome) await response.body?.pipeTo(new WritableStream()).catch(() => {});
		else {
			await response.body?.cancel();
			const location = response.headers.get("location");
			throw new Error(`vitest-plugin-rsc: the Server Action did not run: ${response.url} ` + (location ? `redirected to ${location}.` : `responded with ${response.status}.`));
		}
	} finally {
		registry.serverActions.delete(key);
	}
	if ("error" in ran.outcome) throw ran.outcome.error;
	return ran.outcome.value;
}
function serverActionId(action) {
	const id = Reflect.get(Object(action), "$$id");
	if (typeof id !== "string") throw new Error("vitest-plugin-rsc: Vite RSC did not compile the plugin's own Server Action. Is `vitest-plugin-rsc` excluded from `optimizeDeps`?");
	return id;
}
const unmount = () => leavePage("unmount()");
async function renderServer(...args) {
	const [first, second] = args;
	const options = (isOptions(first) ? first : second) ?? {};
	const { signal } = options;
	signal?.throwIfAborted();
	const { store } = openContext();
	const errors = [];
	const url = new URL(options.url ?? "/", window.location.origin);
	const headers = new Headers(options.headers);
	const cookie = headers.get("cookie");
	headers.delete("cookie");
	const sticky = new Headers(headers);
	sticky.delete("accept");
	if (!headers.has("accept")) headers.set("accept", "text/html");
	const { pathname } = url;
	if (isOptions(first)) {
		if (first.layouts === false) throw new Error("vitest-plugin-rsc: `renderServer({ url, layouts: false })` is not supported yet. To render a page without the layouts of the app, render it as a node: `renderServer(<Page />, { url })`.");
		const ssr = first.ssr ?? !fast("keepApp");
		const opened = {
			pathname,
			proxy: first.proxy ?? true,
			ssr
		};
		return {
			response: await loadPage(url, { headers }, store, {
				opened,
				headers: sticky,
				cookie,
				signal,
				errors,
				inKeptApp: fast("keepApp") && !ssr
			}),
			errors,
			unmount
		};
	}
	const { wrapper, proxy = false } = options;
	const wrap = (node) => wrapper ? createElement(wrapper, null, node) : node;
	const files = options.hostFiles ?? registry.nodeFiles?.() ?? [];
	const layouts = options.layouts ?? false;
	const served = {
		ui: wrap(first),
		layouts,
		files,
		version: 0
	};
	const opened = {
		pathname,
		proxy,
		node: served
	};
	const nodeOnPage = new NodeOnPage(pathname);
	const rerender = (next) => {
		nodeOnPage.at(window.location.pathname);
		return nodeOnPage.rerender((version) => Object.assign(served, {
			ui: wrap(next),
			version
		}));
	};
	if (layouts) {
		if (options.container || options.baseElement) throw new Error("vitest-plugin-rsc: with `layouts` a node renders in the document of its route, whose root layout has the <html> and the <body>. There is no `container` or `baseElement` to pass.");
		return {
			response: await loadPage(url, { headers }, store, {
				opened,
				headers: sticky,
				cookie,
				nodeOnPage,
				signal,
				errors
			}),
			errors,
			get container() {
				return document.body;
			},
			get baseElement() {
				return document.body;
			},
			asFragment: () => fragmentOf(document.body),
			unmount,
			rerender
		};
	}
	if (options.container === document.body || options.container === document.documentElement) throw new Error("vitest-plugin-rsc: the container of a node cannot be the <body> or the <html> of the document, which hold the test's own elements. Pass an element in it, or no container.");
	const left = leavePage("another renderServer()");
	await (signal ? unlessAborted(left, signal, () => {}) : left);
	const base = options.baseElement instanceof HTMLBodyElement ? void 0 : options.baseElement;
	const defaultsToContainer = !options.baseElement && options.container;
	if (options.container && !options.container.isConnected) throw new Error("vitest-plugin-rsc: the container of a node has to be in the document. What is added to the document while a page is open is removed when that page is left, so add the container after it.");
	const container = options.container ?? (base ?? document.body).appendChild(document.createElement("div"));
	if (!options.container) containers.add(container);
	return {
		response: await loadPage(url, { headers }, store, {
			container,
			opened,
			headers: sticky,
			cookie,
			nodeOnPage,
			signal,
			errors
		}),
		errors,
		container,
		get baseElement() {
			return base ?? (defaultsToContainer || document.body);
		},
		asFragment: () => fragmentOf(container),
		unmount,
		rerender
	};
}
function fragmentOf(container) {
	const fragment = document.createRange().createContextualFragment(container.innerHTML);
	for (const script of fragment.querySelectorAll("script")) if (!script.type || /^(text\/javascript|module)$/i.test(script.type)) script.remove();
	return fragment;
}
const containers = /* @__PURE__ */ new Set();
function isOptions(value) {
	if (typeof value !== "object" || value === null || "$$typeof" in value) return false;
	const prototype = Object.getPrototypeOf(value);
	return prototype === Object.prototype || prototype === null;
}
/**
* Leaves the page that `renderServer()` opened, removes the containers it made
* and closes the browser context of the app: its `headers`, the app's
* cookies and what the app put in its storage go, and the document has the
* browser's own APIs again. What still runs of the page, like a timer, uses
* those. The server forgets what it has cached, and what was written to its
* disk, the `fs` of the server code and the tests.
* Unlinks the stylesheets of the files of the host: the host links a file's
* again as it uses it, with `linkStylesheetsOf()`. Runs before and after
* every test, after which the plugin's setup file links those of the setup
* files and the test file again.
*
* What was set on the document, `<html>`, `<head>` and the container of a
* node while the page was open goes with the page; what the host set there
* while no page was open stays. So a library that marks the document once,
* on its first use, is prepared before the first page.
*/
async function cleanup({ url } = {}) {
	await leavePage("cleanup()");
	for (const container of containers) container.remove();
	containers.clear();
	unlinkStylesheets();
	closeContext();
	await loadedSsrLayer()?.resetCaches();
	resetDisk();
	if (url !== void 0) window.history.replaceState(window.history.state, "", url);
}
/**
* Leaves the page, as `cleanup()` does, and opens a new browser context of
* the app: until `cleanup()`, the document has the app's cookies, storage,
* requests and navigations, empty, as a page of the app has them. Outside
* one it has the browser's own. `renderServer()`, `handleRequest()` and
* `runInServerAction()` open one when none is open, so call this before
* what seeds the page before it opens, like an item of `localStorage`. The
* plugin's setup file calls it before every test of a file without
* `"use client"`.
*/
async function newBrowserContext() {
	await cleanup();
	openContext();
}
//#endregion
export { runInServerAction as a, renderServer as i, handleRequest as n, leaveKeptAppWithPage as o, newBrowserContext as r, ssrLayer as s, cleanup as t };
