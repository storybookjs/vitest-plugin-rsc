import { a as versionEvent, f as isHostModule, h as createBuiltLayers, i as invokeEvent, o as webSocketInfoPath, p as builtUrl, r as changedEvent, s as webSocketQuery } from "./websocket-bridge-20VEq6PG.js";
import { r as timersKey, t as runnerTimers } from "./timers-1mbI-StR.js";
import { ModuleRunner, createDefaultImportMeta, ssrDynamicImportKey, ssrExportAllKey, ssrExportNameKey, ssrImportKey, ssrImportMetaKey, ssrModuleExportsKey } from "vite/module-runner";
import hostModules from "virtual:vitest-plugin-rsc/host-modules";
import builtLayers from "virtual:vitest-plugin-rsc/layers";
import * as pageClient from "virtual:vitest-plugin-rsc/vite-client";
//#region src/utils.ts
globalThis.__vitest_plugin_rsc_vite_client__ = pageClient;
const reactClientCoverageModulePath = "/@vite/react-client-coverage-module";
const reactClientCoverageQuery = "vitest-plugin-rsc-react-client-coverage";
const sourceUrlRE = /\/\/# sourceURL=[^\n\r]*/;
const sourceUrlLineRE = /^\/\/# sourceURL=/m;
const nativeFetch = globalThis.fetch;
/**
* Asks the dev server what a plugin answers at `event`, over the websocket of
* the page: see `answerPage()` in websocket-bridge.ts.
*/
async function askDevServer(event, question) {
	const result = await requestOverWebSocket(event, question, false);
	if ("error" in result) throw new Error(`vitest-plugin-rsc: the dev server failed to answer ${event}: ${result.error}`);
	return result.answer;
}
const built = createBuiltLayers(nativeFetch, Object.values(builtLayers ?? {}).filter((layer) => layer !== void 0));
let webSocket;
let webSocketPromise;
let webSocketInfoPromise;
let nextInvokeId = 0;
const invokeTimeout = 3e4;
const setTimeout = globalThis.setTimeout;
const clearTimeout = globalThis.clearTimeout;
const now = performance.now.bind(performance);
let lastAnswer = 0;
const pendingInvokes = /* @__PURE__ */ new Map();
const runners = /* @__PURE__ */ new Map();
function getRunner(environment) {
	let runner = runners.get(environment);
	if (!runner) {
		const invoke = (payload) => invokeEnvironment(environment, payload);
		runners.set(environment, runner = createRunner(environment, invoke));
	}
	return runner;
}
function createRunner(environment, invoke, { sourcemaps = false } = {}) {
	const layer = builtLayers?.[environment];
	const isClosed = () => runner.isClosed();
	const timers = runnerTimers(isClosed);
	const runner = new ModuleRunner({
		sourcemapInterceptor: sourcemaps && !layer ? "prepareStackTrace" : false,
		transport: { invoke: async (payload) => hostModule(payload) ?? (layer ? built.invoke(layer, payload) : invoke(payload)) },
		hmr: false,
		createImportMeta: (file) => Object.assign(createDefaultImportMeta(file), {
			...layer && { url: builtUrl(layer, file) },
			[timersKey]: timers
		})
	}, droppingImportsOnceClosed(isClosed));
	return runner;
}
/**
* A module runner with a module graph of its own: every module it imports is
* evaluated again, the way a page load evaluates a page's scripts again. Call
* `checkFetchedModules()` before every page load, and before a runner that is
* made between two, or a file that changed goes unnoticed.
*/
function createEnvironmentRunner(environment, { sourcemaps = false } = {}) {
	let first;
	const invoke = async (payload) => {
		const modules = await fetchedModules(environment);
		first ??= modules;
		return modules === first ? invokeForPageLoad(environment, payload, modules) : invokeEnvironment(environment, payload);
	};
	const runner = createRunner(environment, invoke, { sourcemaps });
	if (builtLayers?.[environment]) return runner;
	takes.set(runner, async () => {
		const modules = await fetchedModules(environment);
		const since = first?.version;
		if (since !== void 0 && since !== modules.version) {
			const changed = await askDevServer(changedEvent, {
				environment,
				since
			});
			first = modules;
			return changed;
		}
		first = modules;
		return [];
	});
	return runner;
}
const takes = /* @__PURE__ */ new WeakMap();
/**
* For a runner of `createEnvironmentRunner()` that outlives a page load: it
* takes the modules that the tab has fetched now, as the runner of the next
* page load does, where it would ask the server for each one from then on.
* Call `checkFetchedModules()` first, and one at a time. Resolves with the
* ids of the modules that Vite invalidated since the version that the runner
* had: for a change of a file, its modules and the ones that import them.
* The runner keeps what it evaluated, also a module that changed: invalidate
* those.
*/
function takeChangedModules(runner) {
	return takes.get(runner)?.() ?? Promise.resolve([]);
}
function hostModule(payload) {
	const { name, data } = payload.data;
	if (name !== "fetchModule" || !isHostModule(String(data[0]))) return;
	return { result: {
		externalize: data[0],
		type: "module"
	} };
}
/**
* What a runner imports a module of an environment by: its id, or in a build
* the id of the module that it is the entry of.
*/
function environmentModule(environment, id) {
	const entry = builtLayers?.[environment]?.entries[id];
	return entry ? `/${entry}` : id;
}
function importReactClient(id) {
	return getRunner("react_client").import(environmentModule("react_client", id));
}
async function invokeEnvironment(environment, payload) {
	const result = await invokeOverWebSocket(environment, payload);
	return environment === "react_client" ? await withReactClientCoverage(result) : result;
}
const fetchedModulesOf = /* @__PURE__ */ new Map();
function fetchedModules(environment) {
	return fetchedModulesOf.get(environment) ?? askForModules(environment);
}
function askForModules(environment, known) {
	const fetched = requestOverWebSocket(versionEvent, { environment }).then((version) => known && known.version === version ? known : {
		version,
		results: /* @__PURE__ */ new Map()
	});
	fetchedModulesOf.set(environment, fetched);
	fetched.catch(() => {
		if (fetchedModulesOf.get(environment) !== fetched) return;
		if (known) fetchedModulesOf.set(environment, Promise.resolve(known));
		else fetchedModulesOf.delete(environment);
	});
	return fetched;
}
/**
* Asks the server whether the modules that were fetched are still its modules,
* for the runners of `createEnvironmentRunner()`. Before a page load: a file
* can change while the tests run.
*/
async function checkFetchedModules() {
	await Promise.all([...fetchedModulesOf].map(async ([environment, fetched]) => askForModules(environment, await fetched.catch(() => void 0))));
}
const fetchKey = (name, url, importer) => [
	name,
	url,
	url && /^[./]/.test(url) ? void 0 : importer
].join("\n");
async function invokeForPageLoad(environment, payload, modules) {
	const { name, data } = payload.data;
	if (name !== "fetchModule" && name !== "getBuiltins") return invokeEnvironment(environment, payload);
	const [url, importer, options] = data;
	const result = await fetchOnce(environment, payload, modules, fetchKey(name, url, importer));
	if (!isInvokeSuccess(result)) return result;
	if (isCachedResult(result.result) && !options?.cached) return invokeEnvironment(environment, payload);
	return options?.cached && isViteFetchResult(result.result) ? { result: { cache: true } } : result;
}
function fetchOnce(environment, payload, modules, key) {
	let fetching = modules.results.get(key);
	if (fetching) return fetching;
	const forget = () => {
		if (modules.results.get(key) === fetching) modules.results.delete(key);
	};
	fetching = invokeEnvironment(environment, payload).then((result) => {
		if (!isInvokeSuccess(result) || isCachedResult(result.result)) {
			forget();
			return result;
		}
		const fetched = result.result;
		if (!isViteFetchResult(fetched)) return result;
		fetched.invalidate = false;
		const { name, data } = payload.data;
		const known = fetched.url && fetchKey(name, fetched.url);
		if (known && !modules.results.has(known)) modules.results.set(known, fetching);
		const { startOffset } = data[2] ?? {};
		const importer = fetched.file || fetched.id;
		for (const imported of result.imports ?? []) {
			if (isHostModule(imported)) continue;
			const args = [
				imported,
				importer,
				{
					cached: false,
					startOffset
				}
			];
			fetchOnce(environment, {
				...payload,
				data: {
					...payload.data,
					data: args
				}
			}, modules, fetchKey(name, imported, importer)).catch(() => {});
		}
		return result;
	});
	modules.results.set(key, fetching);
	fetching.catch(forget);
	return fetching;
}
function isCachedResult(value) {
	return typeof value === "object" && value !== null && "cache" in value;
}
const AsyncFunction = async function() {}.constructor;
const contextKeys = [
	ssrModuleExportsKey,
	ssrImportMetaKey,
	ssrImportKey,
	ssrDynamicImportKey,
	ssrExportAllKey,
	ssrExportNameKey
];
const strict = "\"use strict\";";
const compiledModules = /* @__PURE__ */ new WeakMap();
const pageLoadEvaluator = {
	startOffset: (() => {
		const source = String(new AsyncFunction("a", "b", `${strict}/*code*/`));
		return source.slice(0, source.indexOf("/*code*/")).split("\n").length - 1;
	})(),
	async runInlinedModule(context, code, module) {
		const fetched = module.meta;
		const shared = fetched?.code === code ? fetched : void 0;
		let run = shared && compiledModules.get(shared);
		if (!run) {
			if (!sourceUrlLineRE.test(code)) code += `\n//# sourceURL=${module.id}`;
			run = new AsyncFunction(...contextKeys, strict + code);
			if (shared) compiledModules.set(shared, run);
		}
		await run(...contextKeys.map((key) => context[key]));
		Object.seal(context[ssrModuleExportsKey]);
	},
	async runExternalModule(file) {
		if (!isHostModule(file)) return import(
			/* @vite-ignore */
			file
);
		const load = hostModules ? hostModules[file] : () => import(
			/* @vite-ignore */
			file
);
		if (!load) throw new Error(`vitest-plugin-rsc: the build has no module of the page ${file}`);
		return (await load()).default;
	}
};
function droppingImportsOnceClosed(isClosed) {
	const dropped = () => new Promise(() => {});
	return {
		...pageLoadEvaluator,
		runInlinedModule(context, code, module) {
			const load = context[ssrDynamicImportKey];
			return pageLoadEvaluator.runInlinedModule({
				...context,
				[ssrDynamicImportKey]: (...args) => load(...args).then((loaded) => isClosed() ? dropped() : loaded, (error) => {
					if (isClosed()) return dropped();
					throw error;
				})
			}, code, module);
		}
	};
}
async function withReactClientCoverage(result) {
	if (!isCoverageEnabled() || !isInvokeSuccess(result) || !isViteFetchResult(result.result) || result.dependency || isNodeModuleFile(result.result.file)) return result;
	const sourceUrl = toBrowserCoverageFileUrl(result.result.file);
	const code = withBrowserSourceUrl(result.result.code, sourceUrl);
	await recordEvaluatedModule(result.result.file, code);
	return {
		...result,
		result: {
			...result.result,
			code
		}
	};
}
function isInvokeSuccess(result) {
	return typeof result === "object" && result !== null && "result" in result;
}
function isCoverageEnabled() {
	return Boolean(globalThis.__vitest_worker__?.config?.coverage?.enabled);
}
function isViteFetchResult(value) {
	return typeof value === "object" && value !== null && "code" in value && "file" in value && typeof value.code === "string" && typeof value.file === "string";
}
function isNodeModuleFile(file) {
	return file.replace(/\\/g, "/").includes("/node_modules/");
}
function withBrowserSourceUrl(code, sourceUrl) {
	const sourceUrlComment = `//# sourceURL=${sourceUrl}`;
	return sourceUrlRE.test(code) ? code.replace(sourceUrlRE, sourceUrlComment) : `${code}\n${sourceUrlComment}`;
}
async function recordEvaluatedModule(file, code) {
	await new Promise((resolve, reject) => {
		const request = new XMLHttpRequest();
		request.open("POST", reactClientCoverageModulePath);
		request.setRequestHeader("content-type", "application/json");
		request.addEventListener("load", () => resolve());
		request.addEventListener("error", () => reject(/* @__PURE__ */ new Error("Failed to record React client coverage module")));
		request.send(JSON.stringify({
			file,
			code
		}));
	});
}
function toBrowserCoverageFileUrl(file) {
	const path = file.replace(/\\/g, "/");
	const encodedPath = encodeURI(path).replace(/\?/g, "%3F").replace(/#/g, "%23");
	const url = new URL(`/@fs${encodedPath.startsWith("/") ? "" : "/"}${encodedPath}`, window.location.origin);
	url.searchParams.set(reactClientCoverageQuery, "1");
	return url.href;
}
function invokeOverWebSocket(environment, payload) {
	return requestOverWebSocket(invokeEvent, {
		environment,
		payload
	});
}
async function requestOverWebSocket(event, data, expires = true) {
	const socket = await getReactClientWebSocket();
	const id = String(++nextInvokeId);
	return new Promise((resolve, reject) => {
		const sent = now();
		const pending = {
			resolve,
			reject,
			timeoutId: expires ? setTimeout(expire, invokeTimeout) : void 0
		};
		function expire() {
			const silent = now() - Math.max(sent, lastAnswer);
			if (silent < invokeTimeout) {
				pending.timeoutId = setTimeout(expire, invokeTimeout - silent);
				return;
			}
			pendingInvokes.delete(id);
			reject(/* @__PURE__ */ new Error(`React client websocket invoke timed out: ${event} ${id}`));
		}
		pendingInvokes.set(id, pending);
		try {
			socket.send(JSON.stringify({
				type: "custom",
				event,
				data: {
					id,
					...data
				}
			}));
		} catch (error) {
			clearTimeout(pending.timeoutId);
			pendingInvokes.delete(id);
			reject(error);
		}
	});
}
async function getReactClientWebSocket() {
	if (webSocket?.readyState === WebSocket.OPEN) return webSocket;
	webSocketPromise ??= openReactClientWebSocket().finally(() => {
		webSocketPromise = void 0;
	});
	return webSocketPromise;
}
async function openReactClientWebSocket() {
	const info = await getWebSocketInfo();
	const socket = new WebSocket(createWebSocketUrl(info), "vite-hmr");
	socket.addEventListener("message", handleWebSocketMessage);
	socket.addEventListener("close", () => {
		if (webSocket === socket) webSocket = void 0;
		rejectPendingInvokes(/* @__PURE__ */ new Error("React client websocket connection closed"));
	});
	await waitForWebSocketOpen(socket);
	webSocket = socket;
	return socket;
}
function waitForWebSocketOpen(socket) {
	return new Promise((resolve, reject) => {
		const cleanup = () => {
			socket.removeEventListener("open", handleOpen);
			socket.removeEventListener("error", handleError);
			socket.removeEventListener("close", handleClose);
		};
		const handleOpen = () => {
			cleanup();
			resolve();
		};
		const handleError = () => {
			cleanup();
			reject(/* @__PURE__ */ new Error("React client websocket connection failed"));
		};
		const handleClose = () => {
			cleanup();
			reject(/* @__PURE__ */ new Error("React client websocket closed before opening"));
		};
		socket.addEventListener("open", handleOpen);
		socket.addEventListener("error", handleError);
		socket.addEventListener("close", handleClose);
	});
}
function handleWebSocketMessage(event) {
	const result = parseInvokeResultMessage(event.data);
	if (!result) return;
	lastAnswer = now();
	const pending = pendingInvokes.get(result.id);
	if (!pending) return;
	clearTimeout(pending.timeoutId);
	pendingInvokes.delete(result.id);
	pending.resolve(result.result);
}
function parseInvokeResultMessage(raw) {
	if (typeof raw !== "string") return;
	try {
		const message = JSON.parse(raw);
		if (message.type !== "custom" || message.event !== "vitest-plugin-rsc:react-client:invoke-result" || typeof message.data?.id !== "string") return;
		return {
			id: message.data.id,
			result: message.data.result
		};
	} catch {
		return;
	}
}
function rejectPendingInvokes(error) {
	for (const pending of pendingInvokes.values()) {
		clearTimeout(pending.timeoutId);
		pending.reject(error);
	}
	pendingInvokes.clear();
}
function createWebSocketUrl(info) {
	const protocol = window.location.protocol === "https:" ? "wss" : "ws";
	const url = new URL(`${protocol}://${window.location.host}${info.path}`);
	url.searchParams.set("token", info.token);
	url.searchParams.set(webSocketQuery, "1");
	return url;
}
async function getWebSocketInfo() {
	webSocketInfoPromise ??= nativeFetch(webSocketInfoPath).then(async (response) => {
		if (!response.ok) throw new Error("Failed to fetch React client websocket info");
		return response.json();
	});
	return webSocketInfoPromise;
}
//#endregion
export { importReactClient as a, environmentModule as i, checkFetchedModules as n, takeChangedModules as o, createEnvironmentRunner as r, askDevServer as t };
