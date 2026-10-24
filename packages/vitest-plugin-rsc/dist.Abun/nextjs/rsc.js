import { t as askDevServer } from "../utils-CNQf4hUJ.js";
import { i as registry, t as actionModulePrefix } from "../registry-DPyevx_W.js";
import { n as builtFiles, o as oncePerTestFile, t as buildDirectory } from "../built-files-CUO9Cl8u.js";
import { d as stylesheetsEvent, i as builtStylesheetsOf } from "../styles-shared-CP5LkHjp.js";
import { i as preloadPage } from "../document-CRlVovHS.js";
import * as ReactServer from "@vitejs/plugin-rsc/react/rsc";
import serverReferences from "virtual:vitest-plugin-rsc/server-references";
import { createElement } from "react";
import { fast, nextConfig } from "virtual:vitest-plugin-rsc/next-manifest";
import { createServerManifest } from "@vitejs/plugin-rsc/core/rsc";
import { prerender } from "@vitejs/plugin-rsc/react/rsc/static";
import * as FlightServer from "@vitejs/plugin-rsc/vendor/react-server-dom/server.edge";
import appPages from "virtual:vitest-plugin-rsc/next-app-pages";
import loadMiddleware from "virtual:vitest-plugin-rsc/next-middleware";
import routeHandlers from "virtual:vitest-plugin-rsc/next-route-handlers";
import { NoFallbackError } from "next/dist/shared/lib/no-fallback-error.external";
import { NodeRendered } from "vitest-plugin-rsc/nextjs/node-rendered";
//#region src/nextjs/rsc.ts
ReactServer.setRequireModule({ load: (id) => {
	if (!serverReferences) return __vite_rsc_raw_import__(id);
	const load = serverReferences[id];
	if (!load) return Promise.reject(/* @__PURE__ */ new Error(`vitest-plugin-rsc: the build has no Server Action module "${id}"`));
	return load();
} });
registry.fast = fast;
registry.flightServer = {
	renderToReadableStream: (model, _clientModules, options) => ReactServer.renderToReadableStream(model, options),
	decodeReply: (body, _serverModules, options) => ReactServer.decodeReply(body, options),
	decodeReplyFromAsyncIterable: (body, _serverModules, options) => FlightServer.decodeReplyFromAsyncIterable(body, createServerManifest(), options),
	decodeAction: (body) => ReactServer.decodeAction(body),
	decodeFormState: (result, body) => ReactServer.decodeFormState(result, body),
	createTemporaryReferenceSet: ReactServer.createTemporaryReferenceSet,
	registerServerReference: ReactServer.registerServerReference,
	registerClientReference: ReactServer.registerClientReference,
	createClientModuleProxy: FlightServer.createClientModuleProxy
};
registry.flightServer.decodeReplyFromBusboy = (busboy, _serverModules, options) => new Promise((resolve, reject) => {
	const form = new FormData();
	busboy.on("field", (name, value) => form.append(name, value));
	busboy.on("file", (name, file, info) => {
		const chunks = [];
		file.on("data", (chunk) => chunks.push(new Uint8Array(chunk)));
		file.on("end", () => form.append(name, new File(chunks, info.filename, { type: info.mimeType })));
	});
	busboy.on("error", reject);
	busboy.on("finish", () => resolve(ReactServer.decodeReply(form, options)));
});
registry.flightStatic = { prerender: (model, _clientModules, options) => prerender(model, options) };
registry.flightClient = {
	createFromReadableStream: (stream, { serverConsumerManifest: _, ...options } = {}) => ReactServer.createFromReadableStream(stream, options),
	encodeReply: ReactServer.encodeReply,
	createTemporaryReferenceSet: ReactServer.createClientTemporaryReferenceSet
};
function withServerCache(entry) {
	const { routeModule } = entry;
	if (routeModule) routeModule.getIncrementalCache = async () => globalThis.__incrementalCache;
	return entry;
}
registry.loadAppPage = async (page) => {
	const load = appPages[page];
	if (!load) throw new Error(`vitest-plugin-rsc: unknown Next.js app page ${page}`);
	return registry.appPages[page] ??= withServerCache(await load());
};
const directory = buildDirectory;
if (directory) {
	builtFiles().catch(() => {});
	const warned = /* @__PURE__ */ new Set();
	const missing = (file) => {
		if (warned.has(file)) return;
		warned.add(file);
		console.warn(`vitest-plugin-rsc: the files that render a node, \`hostFiles\` of renderServer(), name ${file}, which the static build has no stylesheets for: it is no file of the host that the rsc layer built. In a build the files of the host are what \`host.files\` of vitestPluginNext() matches, named from the root of the project. The stylesheets it imports are not linked.`);
	};
	registry.loadStylesheets = async (entry, _inline, files) => builtStylesheetsOf(await builtFiles(), entry, directory, files, missing);
	const linksAtPath = process.env.NODE_ENV === "production" && !nextConfig.deploymentId;
	const encoded = (path) => path.split("/").map(encodeURIComponent).join("/");
	registry.preloadRoute = async (entry, files, signal) => {
		const built = await builtFiles().catch(() => void 0);
		if (!built || signal?.aborted) return;
		const linked = Object.values(builtStylesheetsOf(built, entry, directory, files)).flat();
		preloadPage({
			stylesheets: linksAtPath ? linked.map(({ path }) => new URL(`${nextConfig.assetPrefix}/_next/${encoded(path)}`, location.href).href) : [],
			crossOrigin: nextConfig.crossOrigin || void 0,
			modules: (built.modules[entry] ?? []).map((index) => new URL(built.chunks[index], directory).href)
		});
	};
} else {
	const stylesheets = /* @__PURE__ */ new Map();
	registry.loadStylesheets = (entry, inline, files) => oncePerTestFile(stylesheets, JSON.stringify([
		entry,
		inline,
		files
	]), () => askDevServer(stylesheetsEvent, {
		entry,
		inline,
		files
	}));
	registry.preloadRoute = async () => {};
}
/** The page module of the route of a node: see `loadNodeEntry()` in project/entries.ts. */
async function loadComponent() {
	return { default: function Component() {
		const node = (registry.openedByRequest.getStore() ?? registry.opened)?.node;
		if (!node) throw new Error("vitest-plugin-rsc: the node of the test is gone");
		const { ui, version } = node;
		return version === void 0 ? ui : createElement(NodeRendered, { version }, ui);
	} };
}
const loadRouteHandler = async (page) => {
	const load = routeHandlers[page];
	if (!load) throw new Error(`vitest-plugin-rsc: unknown Next.js route handler ${page}`);
	return withServerCache(await load());
};
registry.loadRouteHandler = async (page) => (await loadRouteHandler(page)).handler;
registry.prerenderVerdict = async ({ kind, page, pathname }) => {
	const { prerenderVerdictOf } = await import("virtual:vitest-plugin-rsc/next-prerender");
	return prerenderVerdictOf(kind === "route" ? await loadRouteHandler(page) : await registry.loadAppPage(page), pathname, kind);
};
registry.isNoFallbackError = (error) => error instanceof NoFallbackError;
registry.loadMiddleware = async () => {
	if (!loadMiddleware) throw new Error("vitest-plugin-rsc: the app has no middleware");
	return (await loadMiddleware()).handler;
};
const modules = /* @__PURE__ */ new Map();
/**
* Next's `__next_app__.require`: the module loader of the server bundle, which
* holds the modules of both server layers. React's Flight codec calls it for a
* reference in a payload, and Next calls it for the module of a Server Action.
*
* Like webpack's, it returns the same promise for the same id: React keeps the
* state of a module on that promise.
*/
function requireModule(id) {
	let loading = modules.get(id);
	if (!loading) modules.set(id, loading = loadModule(id));
	return loading;
}
registry.ownServerAction = import("./server-action.js").then(({ runInServerActionOfTest }) => Reflect.get(runInServerActionOfTest, "$$id"));
registry.hasServerAction = async (id) => {
	if (!id.includes("#")) return false;
	try {
		return (await requireModule(actionModulePrefix + id))[id]?.$$typeof === Symbol.for("react.server.reference");
	} catch {
		return true;
	}
};
async function loadModule(id) {
	if (id.startsWith("action:")) {
		const actionId = id.slice(actionModulePrefix.length);
		return { [actionId]: await ReactServer.loadServerAction(actionId) };
	}
	if (id.startsWith("$$server:")) return globalThis.__vite_rsc_require__(id);
	return registry.loadSsrModule(id);
}
//#endregion
export { loadComponent, requireModule };
