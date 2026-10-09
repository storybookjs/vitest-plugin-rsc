import type { ModuleRunnerTransport } from "vite/module-runner";

// A static build has no dev server to ask for a module. The environments that
// run through a module runner were built into the format the runner evaluates,
// each into one file with every module of it, by its id: see nextjs/build.ts.
// A tab fetches that file once, at the start, and every page load evaluates
// from it: no request for a module, and none of them waits for the one that
// imports it. The id of a module is the path that it would have as a file of
// the build, so what it names by its URL, like its CSS, is where it says.

/** An environment that a static build made into a file for the module runner. */
export type BuiltLayer = {
  /** The URL of the directory of the build, which ends in a slash. */
  base: string;
  /** The id of a module that the page imports by its id. */
  entries: Record<string, string>;
  /** The file with the code of every module of the layer, by its id. */
  modules: string;
};

type InvokePayload = Parameters<NonNullable<ModuleRunnerTransport["invoke"]>>[0];
type InvokeResult = Awaited<ReturnType<NonNullable<ModuleRunnerTransport["invoke"]>>>;
type BuiltModule = { code: string; file: string; id: string; url: string; invalidate: false };

/** The URL of a file of the build, by its path from the directory of the build. */
export function builtUrl(layer: BuiltLayer, file: string): string {
  return new URL(file.replace(/^\/+/, ""), layer.base).href;
}

/**
 * What the transport of a runner of a built layer answers, from the files of
 * the layers that `fetch` fetches. Every page load of a tab asks the same
 * one: the answer for a module is the same for every page, so
 * `pageLoadEvaluator` in utils.ts compiles it once.
 */
export function createBuiltLayers(fetch: typeof globalThis.fetch) {
  // By the URL of the file of a layer.
  const fetched = new Map<string, Promise<Map<string, BuiltModule>>>();

  /** The modules of a layer, which the tab fetches once. */
  function modulesOf(layer: BuiltLayer): Promise<Map<string, BuiltModule>> {
    const url = builtUrl(layer, layer.modules);
    let modules = fetched.get(url);
    if (modules) return modules;
    modules = fetch(url).then(async (response) => {
      if (!response.ok) {
        throw new Error(`vitest-plugin-rsc: ${url} responded with ${response.status}`);
      }
      const codes = (await response.json()) as Record<string, string>;
      return new Map(
        Object.entries(codes).map(([id, code]) => [
          id,
          { code, file: id, id, url: id, invalidate: false },
        ]),
      );
    });
    fetched.set(url, modules);
    // Not kept when it fails: the next page load asks again.
    modules.catch(() => {
      if (fetched.get(url) === modules) fetched.delete(url);
    });
    return modules;
  }

  /** What the transport of a runner of `layer` answers. */
  async function invoke(layer: BuiltLayer, payload: InvokePayload): Promise<InvokeResult> {
    const { name, data } = (payload as { data: { name: string; data: unknown[] } }).data;
    if (name === "getBuiltins") return { result: [] } as InvokeResult;
    if (name !== "fetchModule") {
      return { error: { message: `vitest-plugin-rsc: a build has no "${name}"` } } as InvokeResult;
    }
    const id = data[0] as string;
    try {
      const found = (await modulesOf(layer)).get(id);
      if (!found) throw new Error(`vitest-plugin-rsc: the build has no module ${id}`);
      return { result: found } as InvokeResult;
    } catch (error) {
      return {
        error: { message: String(error instanceof Error ? error.message : error) },
      } as InvokeResult;
    }
  }

  return {
    invoke,
    /** Has the tab fetch the modules of a layer now, before a runner asks. */
    preload(layer: BuiltLayer): void {
      // A runner that asks gets the error.
      modulesOf(layer).catch(() => {});
    },
  };
}
