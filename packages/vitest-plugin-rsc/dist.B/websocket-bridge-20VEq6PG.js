//#region src/built-layers.ts
/**
* For the layers but the rsc layer: the modules a Flight payload can refer
* to, by the id it has for them. In a build the browser layer has it as an
* entry too, so that a runner outside a page evaluates a Client Component by
* that id, like the tab's graph of nextjs/client-graph.ts.
*/
const clientReferencesId = "virtual:vitest-plugin-rsc/client-references";
function safeDecodeURI(id) {
	try {
		return decodeURI(id);
	} catch {
		return id;
	}
}
/** The URL of a file of the build, by its path from the directory of the build. */
function builtUrl(layer, file) {
	return new URL(file.replace(/^\/+/, ""), layer.base).href;
}
/**
* What the transport of a runner of a built layer answers, from the files of
* the layers that `fetch` fetches: the first of `layers` at once, the others
* when a runner asks. Every runner of a tab asks the same
* one, which answers with the same object for a module every time: the code
* is the same for every page, so `pageLoadEvaluator` in utils.ts compiles it
* once.
*/
function createBuiltLayers(fetch, layers) {
	const fetched = /* @__PURE__ */ new Map();
	/** The modules of a layer, which the tab fetches once, now. */
	function modulesOf(layer) {
		const url = builtUrl(layer, layer.modules);
		let modules = fetched.get(url);
		if (modules) return modules;
		modules = fetch(url, { cache: "no-cache" }).then(async (response) => {
			if (!response.ok) throw new Error(`vitest-plugin-rsc: ${url} responded with ${response.status}`);
			const codes = await response.json().catch((error) => {
				throw new Error(`vitest-plugin-rsc: ${url} is not the modules of a layer`, { cause: error });
			});
			return new Map(Object.entries(codes).map(([id, code]) => [id, {
				code,
				file: id,
				id,
				url: id,
				invalidate: false
			}]));
		});
		fetched.set(url, modules);
		modules.catch(() => {
			if (fetched.get(url) === modules) fetched.delete(url);
		});
		return modules;
	}
	if (layers[0]) modulesOf(layers[0]).catch(() => {});
	/** What the transport of a runner of `layer` answers. */
	async function invoke(layer, payload) {
		const { name, data } = payload.data;
		if (name === "getBuiltins") return { result: [] };
		if (name !== "fetchModule") return { error: { message: `vitest-plugin-rsc: a build has no "${name}"` } };
		const id = data[0];
		try {
			const modules = await modulesOf(layer);
			const found = modules.get(id) ?? modules.get(safeDecodeURI(id));
			if (!found) throw new Error(`vitest-plugin-rsc: the build has no module ${id}`);
			return { result: found };
		} catch (error) {
			return { error: { message: String(error instanceof Error ? error.message : error) } };
		}
	}
	return { invoke };
}
//#endregion
//#region src/host-module.ts
const hostModulePrefix = "\0vitest-plugin-rsc/host-module/";
const hostModuleUrl = "/@id/__x00__vitest-plugin-rsc/host-module/";
/** Whether what a runner asks for is a module of the page. */
function isHostModule(url) {
	return url.includes(hostModuleUrl);
}
/**
* The URL by which a built layer of the module runner imports a module of
* the page, by the import it stands for: `host-report` or `host-kit/test`.
*/
const builtHostModuleUrl = (specifier) => hostModuleUrl + specifier;
/**
* For the rsc layer: in a static build, how to load the module of the page
* that each URL of `builtHostModuleUrl()` stands for. Nothing with a dev
* server.
*/
const hostModulesId = "virtual:vitest-plugin-rsc/host-modules";
/** The import that a URL of `builtHostModuleUrl()` stands for. */
const hostModuleSpecifier = (url) => url.slice(url.indexOf(hostModuleUrl) + 42);
//#endregion
//#region src/websocket-bridge.ts
/** Where the page asks for the token and the path of the socket. */
const webSocketInfoPath = "/@vite/react-client-runner-websocket";
/** The query that tells the socket of the page from Vite's own. */
const webSocketQuery = "vitest-plugin-rsc-react-client";
/** Where the page sends an invoke of a runner, for an environment. */
const invokeEvent = "vitest-plugin-rsc:react-client:invoke";
/** Where the page asks for the version of the modules of an environment. */
const versionEvent = "vitest-plugin-rsc:react-client:version";
/**
* Where the page asks which modules of an environment changed after a
* version of them: their ids.
*/
const changedEvent = "vitest-plugin-rsc:react-client:changed";
/** Where the dev server answers what the page asks over the websocket. */
const answerEvent = "vitest-plugin-rsc:react-client:invoke-result";
/**
* Answers what the page asks at `event`, with `askDevServer()` of utils.ts.
* Each ask is one message each way on the socket the page has open. A
* `fetch()` would be a request of HTTP, through a service worker of the app
* too, like MSW's.
*/
function answerPage(server, event, answer) {
	server.ws.on(event, async (data, client) => {
		if (typeof data?.id !== "string") return;
		const { id, ...question } = data;
		let result;
		try {
			result = { answer: await answer(question) };
		} catch (error) {
			server.config.logger.error(`vitest-plugin-rsc: ${event} failed. ${String(error)}`);
			result = { error: error instanceof Error ? error.message : String(error) };
		}
		client.send(answerEvent, {
			id,
			result
		});
	});
}
//#endregion
export { versionEvent as a, builtHostModuleUrl as c, hostModulesId as d, isHostModule as f, createBuiltLayers as h, invokeEvent as i, hostModulePrefix as l, clientReferencesId as m, answerPage as n, webSocketInfoPath as o, builtUrl as p, changedEvent as r, webSocketQuery as s, answerEvent as t, hostModuleSpecifier as u };
