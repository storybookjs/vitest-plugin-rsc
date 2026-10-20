import clientReferences from "virtual:vitest-plugin-rsc/client-references";
import { registry } from "./registry.ts";

// How a module is loaded by the id a Flight payload has for it. With a dev
// server that id is the one Vite imports the module by. A static build has a
// list of the modules that can be referred to: see ../static-build.ts.
function importModule(id: string): Promise<unknown> {
  if (!clientReferences) return import(/* @vite-ignore */ id);
  const load = clientReferences[id];
  if (!load) {
    return Promise.reject(
      new Error(`vitest-plugin-rsc: the build has no Client Component "${id}"`),
    );
  }
  return load();
}

// A Client Component in a Flight payload is loaded by its module id, in the
// module graph of the layer whose Flight client asks for it. With `ready`, no
// module loads before it resolves.
function createModuleLoader(ready?: Promise<void>): (id: string) => Promise<unknown> {
  const modules = new Map<string, Promise<unknown>>();
  return (id) => {
    // Vite RSC tags an id to tell reloads of a module apart.
    id = id.split("$$cache=")[0]!;
    let loading = modules.get(id);
    if (!loading) {
      const load = () => importModule(id);
      modules.set(id, (loading = ready ? ready.then(load) : load()));
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
export function registerModuleLoader(layer: "ssr" | "browser", ready?: Promise<void>): () => void {
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
