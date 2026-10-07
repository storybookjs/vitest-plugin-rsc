import { registry } from "./registry.ts";

// A Client Component in a Flight payload is loaded by its module id, in the
// module graph of the layer whose Flight client asks for it.
function createModuleLoader(): (id: string) => Promise<unknown> {
  const modules = new Map<string, Promise<unknown>>();
  return (id) => {
    // Vite RSC tags an id to tell reloads of a module apart.
    id = id.split("$$cache=")[0]!;
    let loading = modules.get(id);
    if (!loading) modules.set(id, (loading = import(/* @vite-ignore */ id)));
    return loading;
  };
}

export function registerModuleLoader(layer: "ssr" | "browser"): void {
  if (layer === "ssr") registry.loadSsrModule = createModuleLoader();
  else registry.loadBrowserModule = createModuleLoader();
}
