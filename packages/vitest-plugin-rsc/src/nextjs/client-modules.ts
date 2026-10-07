import { registry } from "./registry.ts";

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
      const load = () => import(/* @vite-ignore */ id);
      modules.set(id, (loading = ready ? ready.then(load) : load()));
    }
    return loading;
  };
}

export function registerModuleLoader(layer: "ssr" | "browser", ready?: Promise<void>): void {
  if (layer === "ssr") registry.loadSsrModule = createModuleLoader(ready);
  else registry.loadBrowserModule = createModuleLoader(ready);
}
