import { i as registry } from "./registry-DPyevx_W.js";
import clientReferences from "virtual:vitest-plugin-rsc/client-references";
//#region src/nextjs/client-modules.ts
function importModule(id) {
	if (!clientReferences) return import(
		/* @vite-ignore */
		id
);
	const load = clientReferences[id];
	if (!load) return Promise.reject(/* @__PURE__ */ new Error(`vitest-plugin-rsc: the build has no Client Component "${id}"`));
	return load();
}
function createModuleLoader(ready) {
	const modules = /* @__PURE__ */ new Map();
	return (id) => {
		id = id.split("$$cache=")[0];
		let loading = modules.get(id);
		if (!loading) {
			const load = () => importModule(id);
			modules.set(id, loading = ready ? ready.then(load) : load());
		}
		return loading;
	};
}
/**
* Has the layer load its Client Components with a loader of its own.
* Returns how to forget the loader of the browser layer, which keeps the
* modules that it loaded: the layer then has none, as before its first
* page, unless another page's has come since.
*/
function registerModuleLoader(layer, ready) {
	const loader = createModuleLoader(ready);
	if (layer === "ssr") {
		registry.loadSsrModule = loader;
		return () => {};
	}
	registry.loadBrowserModule = loader;
	return () => {
		if (registry.loadBrowserModule === loader) delete registry.loadBrowserModule;
	};
}
//#endregion
export { registerModuleLoader as t };
