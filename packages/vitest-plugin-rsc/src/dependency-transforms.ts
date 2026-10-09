import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import type { DevEnvironment, Plugin } from "vite";

// For an environment that the page runs through a module runner, Vite compiles
// every pre-bundled dependency again in every run, when a page first asks for
// it: it turns the file into a syntax tree in JavaScript, megabytes for a
// package like an icon set, and walks it to rewrite every import and export.
// That was most of what the dev server did while a page loaded for the first
// time in a run.
//
// Rolldown, which Vite comes with, does that step natively, about ten times as
// fast and off the main thread, but Vite does not use it yet. So for
// a pre-bundled file the plugin runs Vite's plugins as Vite does, then
// Rolldown's transform in place of Vite's own, and gives Vite the result as
// the one it has for the module. Without Rolldown's transform, or when it
// fails on a file, Vite compiles the file as it always did.

export type ModuleRunnerTransform = (
  filename: string,
  code: string,
) => Promise<{ code: string; deps: string[]; dynamicDeps: string[]; errors: unknown[] }>;

type ModuleNode = Awaited<ReturnType<DevEnvironment["moduleGraph"]["ensureEntryFromUrl"]>>;

export function dependencyTransformPlugin(): Plugin {
  return {
    name: "rsc:dependency-transforms",
    async configureServer(server) {
      const transform = await rolldownTransform();
      if (!transform) return;
      for (const environment of Object.values(server.environments)) {
        const { consumer, dev } = environment.config;
        if (consumer === "client" && dev.moduleRunnerTransform) {
          transformDependencies(environment, transform);
        }
      }
    },
  };
}

// The transform of the Rolldown of the Vite that this package finds, which is
// the one that runs the dev server: this package does not depend on Rolldown
// itself.
export async function rolldownTransform(): Promise<ModuleRunnerTransform | undefined> {
  try {
    const vite = createRequire(import.meta.url).resolve("vite/package.json");
    const experimental = createRequire(vite).resolve("rolldown/experimental");
    const { moduleRunnerTransform } = (await import(pathToFileURL(experimental).href)) as {
      moduleRunnerTransform?: unknown;
    };
    if (typeof moduleRunnerTransform === "function") {
      return moduleRunnerTransform as ModuleRunnerTransform;
    }
  } catch {
    // A Vite without Rolldown, or a Rolldown without the transform.
  }
}

export function transformDependencies(
  environment: DevEnvironment,
  transform: ModuleRunnerTransform,
): void {
  const { moduleGraph, pluginContainer } = environment;

  // Vite compiles a module for the page that asks for it, and ahead of that
  // for the module that imports it. Whichever comes first compiles it here.
  const transforming = new Map<ModuleNode, Promise<void>>();
  async function prepare(url: string): Promise<void> {
    const optimizer = environment.depsOptimizer;
    // Vite refuses a module of a server that closes.
    if (!optimizer || (environment as { _closing?: boolean })._closing) return;
    const entry = await moduleGraph.ensureEntryFromUrl(url);
    if (!entry.id || !optimizer.isOptimizedDepFile(entry.id)) return;
    let pending = transforming.get(entry);
    if (!pending) {
      pending = transformInto(entry, entry.id).finally(() => transforming.delete(entry));
      transforming.set(entry, pending);
    }
    await pending;
  }

  // What Vite does for a module, with Rolldown's transform as the last step.
  async function transformInto(entry: ModuleNode, id: string): Promise<void> {
    // A module that Vite takes another look at keeps its result from Vite, or
    // has Vite compile it again: it says so in a property that is Vite's own.
    const stateOf = () => (entry as { invalidationState?: unknown }).invalidationState;
    if (entry.transformResult || typeof stateOf() === "object") return;
    const state = stateOf();
    const invalidated = entry.lastInvalidationTimestamp;
    // The pre-bundled file, or the error that its URL is of a bundle that Vite
    // has replaced.
    const loaded = await pluginContainer.load(id);
    if (loaded == null) return;
    const source = typeof loaded === "string" ? { code: loaded, map: null } : loaded;
    const { code } = await pluginContainer.transform(source.code, id, { inMap: source.map });
    const result = await transform(entry.file ?? id, code);
    if (result.errors.length > 0 || entry.transformResult || stateOf() !== state) return;
    if (entry.lastInvalidationTimestamp !== invalidated) return;
    // Rolldown has the imports in another order than the module, and the page
    // asks for them in this one: see `describeModule()` in index.ts.
    const at = (dep: string) => {
      const index = result.code.indexOf(`__vite_ssr_import__(${JSON.stringify(dep)}`);
      return index === -1 ? Infinity : index;
    };
    // Without a source map, which is how a dependency comes: see
    // `dependencySourceMapPlugin()` in index.ts.
    moduleGraph.updateModuleTransformResult(entry, {
      code: result.code,
      map: null,
      ssr: true,
      deps: result.deps.toSorted((a, b) => at(a) - at(b)),
      dynamicDeps: result.dynamicDeps,
    });
  }

  // Vite says what is wrong with a module it cannot compile.
  const { transformRequest, warmupRequest } = environment;
  environment.transformRequest = async function (url, ...rest) {
    await prepare(url).catch(() => {});
    return transformRequest.call(this, url, ...rest);
  };
  environment.warmupRequest = async function (url) {
    await prepare(url).catch(() => {});
    return warmupRequest.call(this, url);
  };
}
