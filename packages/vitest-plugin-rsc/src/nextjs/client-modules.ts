import clientReferences from "virtual:vitest-plugin-rsc/next-client-references";
import { registry } from "./registry.ts";

// How a module is loaded by the id a Flight payload has for it. With a dev
// server that id is the one Vite imports the module by. A static build has a
// list of the modules that can be referred to: see build.ts.
function importModule(id: string): Promise<unknown> {
  if (!clientReferences) return import(/* @vite-ignore */ id);
  const load = clientReferences[id];
  if (!load) throw new Error(`vitest-plugin-rsc: the build has no Client Component "${id}"`);
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

// The loader of the layer this copy of the module is in.
let load: ((id: string) => Promise<unknown>) | undefined;

export function registerModuleLoader(layer: "ssr" | "browser", ready?: Promise<void>): void {
  load = createModuleLoader(ready);
  if (layer === "ssr") registry.loadSsrModule = load;
  else registry.loadBrowserModule = load;
}

/**
 * Loads a module of this layer by the id a Flight payload would have for it,
 * in the module graph of the page. The same promise for the same id.
 */
export function loadModule(id: string): Promise<unknown> {
  if (!load) throw new Error("vitest-plugin-rsc: the layer has not started");
  return load(id);
}
