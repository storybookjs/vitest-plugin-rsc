import { f as isHostModule, m as clientReferencesId } from "./websocket-bridge-20VEq6PG.js";
import { i as pageScope, n as pageHooks, t as SequentialAsyncLocalStorage } from "./async-local-storage-B5kOHq_J.js";
import { i as environmentModule, n as checkFetchedModules, o as takeChangedModules, r as createEnvironmentRunner, t as askDevServer } from "./utils-CNQf4hUJ.js";
import { i as registry, n as loadsNothing } from "./registry-DPyevx_W.js";
import { n as builtFiles, o as oncePerTestFile, t as buildDirectory } from "./built-files-CUO9Cl8u.js";
import { c as graphStylesheetAttribute, d as stylesheetsEvent, l as stylesheetOfUrl, r as builtHostFileStylesheetsOf, t as builtFileKey, u as stylesheetsChangedEvent } from "./styles-shared-CP5LkHjp.js";
import { t as clientFileKeyExport } from "./client-file-key-BwvL_T8k.js";
import { Buffer } from "node:buffer";
import env from "virtual:vitest-plugin-rsc/next-env";
//#region src/nextjs/globals.ts
const NativeRequest = Request;
const NativeResponse = Response;
function headersOf(init, input) {
	if (init?.headers) return new Headers(init.headers);
	return new Headers(input instanceof NativeRequest ? input.headers : void 0);
}
var ServerRequest = class ServerRequest extends NativeRequest {
	#headers;
	constructor(input, init) {
		const body = init?.body;
		if (body && typeof body.on === "function" && typeof body.pipe === "function") init = {
			...init,
			body: new ReadableStream({
				start(controller) {
					body.on("data", (chunk) => controller.enqueue(typeof chunk === "string" ? new TextEncoder().encode(chunk) : new Uint8Array(chunk)));
					body.on("end", () => controller.close());
					body.on("error", (error) => controller.error(error));
				},
				cancel: (reason) => body.destroy?.(reason)
			})
		};
		super(input, init?.body ? {
			duplex: "half",
			...init
		} : init);
		this.#headers = headersOf(init, input);
		const contentType = super.headers.get("content-type");
		if (contentType && !this.#headers.has("content-type")) this.#headers.set("content-type", contentType);
	}
	get headers() {
		return this.#headers;
	}
	clone() {
		return new ServerRequest(super.clone(), { headers: this.#headers });
	}
	static [Symbol.hasInstance](value) {
		return Function.prototype[Symbol.hasInstance].call(this === ServerRequest ? NativeRequest : this, value);
	}
};
var ServerResponse = class ServerResponse extends NativeResponse {
	#headers;
	constructor(body, init) {
		super(body, init);
		this.#headers = headersOf(init);
		const contentType = super.headers.get("content-type");
		if (contentType && !this.#headers.has("content-type")) this.#headers.set("content-type", contentType);
	}
	get headers() {
		return this.#headers;
	}
	clone() {
		const clone = super.clone();
		return new ServerResponse(clone.body, {
			status: clone.status,
			statusText: clone.statusText,
			headers: this.#headers
		});
	}
	static json(data, init) {
		const json = NativeResponse.json(data, init);
		const headers = headersOf(init);
		if (!headers.has("content-type")) headers.set("content-type", "application/json");
		return new ServerResponse(json.body, {
			status: json.status,
			statusText: json.statusText,
			headers
		});
	}
	static [Symbol.hasInstance](value) {
		return Function.prototype[Symbol.hasInstance].call(this === ServerResponse ? NativeResponse : this, value);
	}
};
registry.Request = ServerRequest;
registry.Response = ServerResponse;
registry.enterRequestScope = pageScope;
registry.openedByRequest = new SequentialAsyncLocalStorage();
registry.asyncFunctionHooks = pageHooks;
const nativeQueueMicrotask = globalThis.queueMicrotask;
registry.queueMicrotask = (callback) => nativeQueueMicrotask(SequentialAsyncLocalStorage.bind(callback));
const renders = /* @__PURE__ */ new WeakMap();
registry.performWork = (request, performWork) => {
	let inStores = renders.get(request);
	if (!inStores) renders.set(request, inStores = SequentialAsyncLocalStorage.snapshot());
	inStores(performWork, request);
};
const nativeFetch = globalThis.fetch;
registry.fetch = (input, init) => nativeFetch(input, init);
registry.network = (input, init) => nativeFetch(input, init);
const scope = globalThis;
scope.process ??= { env: {} };
scope.process.env ??= {};
for (const [name, value] of Object.entries(env)) scope.process.env[name] ??= value;
scope.global ??= scope;
scope.global.process ??= scope.process;
scope.Buffer ??= Buffer;
for (const method of ["indexOf", "lastIndexOf"]) {
	const original = Buffer.prototype[method];
	Buffer.prototype[method] = function(value, ...rest) {
		if (value instanceof Uint8Array && !Buffer.isBuffer(value)) value = Buffer.from(value.buffer, value.byteOffset, value.byteLength);
		return original.call(this, value, ...rest);
	};
}
{
	const isBase64url = (encoding) => typeof encoding === "string" && encoding.toLowerCase() === "base64url";
	const base64 = (text) => text.replaceAll("-", "+").replaceAll("_", "/");
	const base64url = (text) => text.replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
	const statics = Buffer;
	const { from, byteLength, isEncoding } = statics;
	statics.from = function(value, encoding, ...rest) {
		return isBase64url(encoding) && typeof value === "string" ? from.call(this, base64(value), "base64") : from.call(this, value, encoding, ...rest);
	};
	statics.byteLength = function(value, encoding) {
		return isBase64url(encoding) && typeof value === "string" ? byteLength.call(this, base64(value), "base64") : byteLength.call(this, value, encoding);
	};
	statics.isEncoding = (encoding) => isBase64url(encoding) || isEncoding.call(Buffer, encoding);
	const prototype = Buffer.prototype;
	const toString = prototype.toString;
	const write = prototype.write;
	prototype.toString = function(encoding, ...rest) {
		return isBase64url(encoding) ? base64url(toString.apply(this, ["base64", ...rest])) : toString.apply(this, [encoding, ...rest]);
	};
	prototype.write = function(text, ...rest) {
		const at = rest.findLastIndex((value) => typeof value === "string");
		if (at === -1 || !isBase64url(rest[at])) return write.apply(this, [text, ...rest]);
		const args = [...rest];
		args[at] = "base64";
		return write.apply(this, [base64(text), ...args]);
	};
}
scope.AsyncLocalStorage ??= SequentialAsyncLocalStorage;
const immediates = /* @__PURE__ */ new Map();
const channel = new MessageChannel();
channel.port1.onmessage = () => {
	const [id, run] = immediates.entries().next().value ?? [];
	if (id === void 0) return;
	immediates.delete(id);
	run();
};
function immediate(callback, args) {
	const id = Symbol("immediate");
	immediates.set(id, () => callback(...args));
	channel.port2.postMessage(null);
	return id;
}
{
	const { process } = scope;
	process.cwd ??= () => "/";
	process.on ??= () => process;
	process.off ??= () => process;
	process.nextTick ??= (callback, ...args) => queueMicrotask(() => callback(...args));
	process.hrtime ??= Object.assign(() => [0, 0], { bigint: () => BigInt(Math.round(performance.now() * 1e6)) });
	const nativeSetTimeout = globalThis.setTimeout;
	const nativeClearTimeout = globalThis.clearTimeout;
	registry.setImmediate = (callback, ...args) => registry.fast?.immediates ? immediate(callback, args) : nativeSetTimeout(callback, 0, ...args);
	registry.clearImmediate = (id) => typeof id === "symbol" ? immediates.delete(id) : nativeClearTimeout(id);
	registry.setTimeout = (callback, delay, ...args) => registry.fast?.immediates && !(Number(delay) > 0) && typeof callback === "function" && globalThis.setTimeout === nativeSetTimeout ? immediate(callback, args) : globalThis.setTimeout(callback, delay, ...args);
	registry.clearTimeout = (id) => typeof id === "symbol" ? immediates.delete(id) : globalThis.clearTimeout(id);
	const latin1 = (bytes) => {
		let text = "";
		for (let at = 0; at < bytes.length; at += 8192) text += String.fromCharCode(...bytes.subarray(at, at + 8192));
		return text;
	};
	const decoders = {
		latin1,
		ascii: latin1,
		utf8: (bytes) => new TextDecoder("utf-8").decode(bytes),
		ucs2: (bytes) => new TextDecoder("utf-16le").decode(bytes)
	};
	for (const [encoding, decode] of Object.entries(decoders)) {
		if (`${encoding}Slice` in Uint8Array.prototype) continue;
		Object.defineProperty(Uint8Array.prototype, `${encoding}Slice`, {
			configurable: true,
			writable: true,
			value(start, end) {
				return decode(this.subarray(start, end));
			}
		});
	}
}
//#endregion
//#region src/nextjs/stylesheet-versions.ts
function stylesheetVersions(urls) {
	return new Map(urls.flatMap((url) => {
		const stylesheet = stylesheetOfUrl(url);
		return stylesheet === void 0 ? [] : [[stylesheet, url]];
	}));
}
const replaced = /* @__PURE__ */ new WeakSet();
/**
* Moves `link` to `url`: a link of `url` comes next to it, with the same
* attributes, and `link` goes once that one has loaded or failed, so the
* document is never without the CSS. A link that has no CSS yet, out of the
* document or still loading, gets the URL itself: what waits for its `load`
* gets that of `url`. Returns the link of `url`.
*/
function moveLink(link, url) {
	if (!link.isConnected || !link.sheet) {
		link.href = url;
		return link;
	}
	const moved = link.cloneNode();
	moved.href = url;
	replaced.add(link);
	const remove = () => link.remove();
	moved.addEventListener("load", remove, { once: true });
	moved.addEventListener("error", remove, { once: true });
	link.after(moved);
	return moved;
}
/** Moves the links of the page, not the graph's, to the versions of now. */
function movePageLinks(versions) {
	const links = document.querySelectorAll("link[rel~=\"stylesheet\"][href]");
	for (const link of links) {
		if (replaced.has(link) || link.hasAttribute("data-vitest-plugin-rsc-graph")) continue;
		const stylesheet = stylesheetOfUrl(link.href);
		const url = stylesheet === void 0 ? void 0 : versions.get(stylesheet);
		if (url !== void 0 && new URL(url, link.href).pathname !== new URL(link.href).pathname) moveLink(link, url);
	}
}
import.meta.hot?.on(stylesheetsChangedEvent, (urls) => movePageLinks(stylesheetVersions(urls)));
//#endregion
//#region src/nextjs/client-graph.ts
const environment = "react_client";
let graph;
const linked = /* @__PURE__ */ new Map();
const keyOf = (href) => stylesheetOfUrl(href) ?? href;
let cleanups = 0;
const evaluations = /* @__PURE__ */ new Map();
const imported = /* @__PURE__ */ new Set();
const evaluationOf = /* @__PURE__ */ new WeakMap();
const isDependency = ({ id, file }) => isHostModule(id) || (file ?? id).includes("/node_modules/");
const browserRequire = (id) => registry.loadBrowserModule?.(id) ?? loadsNothing();
/**
* Evaluates a file of the host with `"use client"` in the module graph of
* the browser layer: the file with the reference key `key`, which with a dev
* server is its URL in that layer. The module of the rsc layer for the file
* calls this before its own code runs, as Vitest evaluates what a file
* imports before it. So a test file with the directive registers its tests
* with Vitest, which imports the file in the rsc layer, and a setup file
* with it its hooks.
*
* Once for each version of the file, as the browser evaluates a module
* once: a second import of the file gets the evaluation of the first, or
* its error. A change of the file, or of a module that it imports, is a new
* version of it, which evaluates the file again, and so is
* `forgetClientFiles()`, which the plugin's setup file calls before every
* test file, as Vitest evaluates a setup file and a test file again for
* each. What the file imports, once for the graph until it changes, as the
* browser does for what Vitest evaluates in the tab.
*/
async function loadClientFile(key) {
	if (buildDirectory) {
		graph ??= createEnvironmentRunner(environment);
		const load = (await graph.import(environmentModule(environment, clientReferencesId))).default[key];
		if (!load) throw new Error(`vitest-plugin-rsc: the build has no client reference "${key}"`);
		registry.browserRequire = browserRequire;
		evaluations.set(key, await load());
		return;
	}
	graph ??= createEnvironmentRunner(environment, { sourcemaps: true });
	const caughtUp = catchingUp.then(() => catchUp(graph));
	catchingUp = caughtUp.catch(() => {});
	await caughtUp;
	registry.browserRequire = browserRequire;
	imported.add(key);
	evaluations.set(key, await graph.import(key));
}
let catchingUp = Promise.resolve();
async function catchUp(graph) {
	await checkFetchedModules();
	const { evaluatedModules } = graph;
	const changed = /* @__PURE__ */ new Set();
	const add = (id) => {
		const node = evaluatedModules.getModuleById(id);
		if (node && !isDependency(node)) changed.add(node);
	};
	for (const id of await takeChangedModules(graph)) add(id);
	for (const node of changed) node.importers.forEach(add);
	for (const node of changed) evaluatedModules.invalidateModule(node);
}
/**
* The module that the host imported, as the host uses it. For a file of the
* host with `"use client"`, which the rsc layer has as a client reference
* module, the file's own exports from the browser layer: the evaluation the
* graph has when the host first asks for the module, the one that the
* module's line loaded unless the graph evaluated the file again since. The
* same object for the same module, every time. Such a module has the export
* `clientFileKeyExport`, which the plugin put in front of it, and that alone
* tells it: other exports, like one that a plugin of the host adds, change
* nothing. Any other module as it is. Links nothing: a host that uses the
* file links its stylesheets with `linkStylesheetsOf()`.
*
* Rejects for the client reference module of a file that is not the host's,
* which nothing evaluated in the browser layer.
*/
async function loadClientModule(module) {
	const key = Reflect.get(module, clientFileKeyExport);
	if (typeof key !== "string") return module;
	let exports = evaluationOf.get(module);
	if (!exports) {
		exports = evaluations.get(key);
		if (!exports) throw new Error(`vitest-plugin-rsc: ${key} has "use client" and is not a file of the host, so nothing loaded it in the browser layer for loadClientModule(). ${key} is the reference key that Vite RSC gives the file: its URL with a dev server, and in a static build a hash of the file. The files of the host are the ones that host.files of vitestPluginNext() matches.`);
		evaluationOf.set(module, exports);
	}
	return exports;
}
/**
* Links the stylesheets of files of the host that the host uses, like a
* framework that renders a component of one, or one that renders as it
* loads: what each imports, in the browser layer for a file with
* `"use client"`, in their order, as they are now. The files as for
* `hostFiles` of `renderServer()`: absolute, or from the root of the
* project. Resolves once the stylesheets have loaded.
*
* The use ends as `signal` aborts, and without one at `cleanup()`, which ends
* every use: a stylesheet goes once no use holds it. An aborted signal links
* nothing, and a use whose signal aborts rejects at once with the signal's
* reason, as `renderServer()` does: also while it asks for the stylesheets,
* whose answer then links nothing.
*/
async function linkStylesheetsOf(hostFiles, { signal } = {}) {
	signal?.throwIfAborted();
	const cleanupsBefore = cleanups;
	let held = [];
	const use = (async () => {
		const urls = await stylesheetsOfHostFiles(hostFiles);
		if (signal?.aborted || cleanups !== cleanupsBefore) return;
		held = urls.map(hold);
		await Promise.all(held.map((stylesheet) => stylesheet.loaded));
	})();
	if (!signal) return use;
	const ended = new Promise((_, reject) => signal.addEventListener("abort", () => {
		held.forEach(release);
		reject(signal.reason);
	}, { once: true }));
	return Promise.race([use, ended]);
}
const hostStylesheets = /* @__PURE__ */ new Map();
async function stylesheetsOfHostFiles(hostFiles) {
	if (hostFiles.length === 0) return [];
	return oncePerTestFile(hostStylesheets, hostFiles.join("\n"), () => stylesheetsOfHostFilesUncached(hostFiles));
}
async function stylesheetsOfHostFilesUncached(hostFiles) {
	if (!buildDirectory) return askDevServer(stylesheetsEvent, { hostFiles });
	const built = await builtFiles();
	const keys = Object.keys(built.hostFiles);
	const urls = hostFiles.flatMap((file) => {
		const key = builtFileKey(file, keys);
		return key === void 0 ? [] : builtHostFileStylesheetsOf(built, key, buildDirectory);
	});
	return [...new Set(urls)];
}
function hold(href) {
	const known = linked.get(keyOf(href));
	if (known) {
		known.uses++;
		if (known.href !== href) move(known, href);
		return known;
	}
	const link = Object.assign(document.createElement("link"), {
		rel: "stylesheet",
		href
	});
	link.setAttribute(graphStylesheetAttribute, "");
	const stylesheet = {
		href,
		link,
		uses: 1,
		...loading(link)
	};
	linked.set(keyOf(href), stylesheet);
	document.head.append(link);
	return stylesheet;
}
function loading(link) {
	let settle;
	return {
		loaded: new Promise((resolve) => {
			settle = () => resolve();
			link.addEventListener("load", settle, { once: true });
			link.addEventListener("error", settle, { once: true });
		}),
		settle
	};
}
function move(stylesheet, href) {
	const link = moveLink(stylesheet.link, href);
	stylesheet.href = href;
	if (link === stylesheet.link) return;
	stylesheet.settle();
	stylesheet.previous = stylesheet.link;
	stylesheet.link = link;
	Object.assign(stylesheet, loading(link));
}
/**
* Moves the stylesheets that the files of the host linked to the versions of
* now, after a change of their CSS: see stylesheet-versions.ts.
*/
function moveGraphLinks(versions) {
	for (const [key, stylesheet] of linked) {
		const href = versions.get(key);
		if (href !== void 0 && href !== stylesheet.href) move(stylesheet, href);
	}
}
import.meta.hot?.on(stylesheetsChangedEvent, (urls) => moveGraphLinks(stylesheetVersions(urls)));
function release(stylesheet) {
	if (linked.get(keyOf(stylesheet.href)) !== stylesheet) return;
	if (--stylesheet.uses === 0) unlink(stylesheet);
}
function unlink(stylesheet) {
	for (const link of [stylesheet.link, stylesheet.previous]) {
		link?.remove();
		link?.removeAttribute(graphStylesheetAttribute);
	}
	linked.delete(keyOf(stylesheet.href));
	stylesheet.settle();
}
/**
* Unlinks the stylesheets of the files of the host, which ends every use of
* them: `cleanup()` calls this, once it has left the page.
*/
function unlinkStylesheets() {
	cleanups++;
	for (const stylesheet of linked.values()) unlink(stylesheet);
}
/**
* Forgets what the files of the host did in the tab: with a dev server the
* graph evaluates each again the next time it loads, also one that failed,
* and the stylesheets they linked go. The plugin's setup file calls this
* before every test file, under Vitest. The graph keeps what the files
* import, and a module whose line ran before still gets the evaluation it
* loaded.
*/
function forgetClientFiles() {
	for (const url of imported) {
		const own = graph?.evaluatedModules.getModuleByUrl(url);
		if (own) graph?.evaluatedModules.invalidateModule(own);
	}
	imported.clear();
	unlinkStylesheets();
}
/**
* Whether the graph evaluated `file`, a file of the host, as one with
* `"use client"` since `forgetClientFiles()`, with a dev server. Under Vitest
* that tells a test file with the directive, once Vitest has collected it.
*/
function loadedAsClientFile(file) {
	return [...graph?.evaluatedModules.getModulesByFile(file) ?? []].some((module) => imported.has(module.url));
}
/**
* What a Server Action calls while no page of the app is open. A Server
* Action that a component of the browser layer calls goes through
* `callServer()` of Vite RSC, which calls the global `__viteRscCallServer`.
* A page sets Next's own, which posts to that page (client.tsx). A client
* file has no page, and the router of a page that was left would never
* answer. So this one is there from the start, and again once a page is left
* (`leavePage()` in page.ts).
*/
async function callServerWithoutPage(id) {
	const name = id.split("#").at(-1);
	throw new Error(`vitest-plugin-rsc: a component called the Server Action ${name}, and no page of the app is open to post it to. A Server Action needs Next's app, which a file with "use client" does not render in, like a test file with the directive: render the component with renderServer(), from a file without "use client".`);
}
globalThis.__viteRscCallServer = callServerWithoutPage;
//#endregion
export { loadClientModule as a, loadClientFile as i, forgetClientFiles as n, loadedAsClientFile as o, linkStylesheetsOf as r, unlinkStylesheets as s, callServerWithoutPage as t };
