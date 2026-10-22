import type { ModuleRunnerTransport } from "vite/module-runner";

// A static build has no dev server to ask for a module. The environments that
// run through a module runner were built into the format the runner evaluates,
// each into one file with every module of it, by its id: see static-build.ts.
// A tab fetches that file once, and its runners evaluate from it, like the one of each page load of the browser layer: no request for a
// module, and none of them waits for the one that imports it. The id of a
// module is the path that it would have as a file of the build, so what it
// names by its URL, like its CSS, is where it says.
//
// The first is the layer that every page runs, which the tab fetches at
// once: a page of the build preloads it from its HTML. Each of the others
// when a runner of it first asks for a module.

/**
 * For the layers but the rsc layer: the modules a Flight payload can refer
 * to, by the id it has for them. In a build the browser layer has it as an
 * entry too, so that a runner outside a page evaluates a Client Component by
 * that id, like the tab's graph of nextjs/client-graph.ts.
 */
export const clientReferencesId = "virtual:vitest-plugin-rsc/client-references";

/** An environment that a static build made into a file for the module runner. */
export type BuiltLayer = {
  /** The URL of the directory of the build, which ends in a slash. */
  base: string;
  /**
   * The modules of the layer that the page imports by an id of their own,
   * by that id: their paths from the directory of the build. The entry of
   * the layer, like `vitest-plugin-rsc/nextjs/ssr`, and for the browser
   * layer the list of its client references, by `clientReferencesId`.
   */
  entries: Record<string, string>;
  /** The file with the code of every module of the layer, by its id. */
  modules: string;
};

export type InvokePayload = Parameters<NonNullable<ModuleRunnerTransport["invoke"]>>[0];
export type InvokeResult = Awaited<ReturnType<NonNullable<ModuleRunnerTransport["invoke"]>>>;
type BuiltModule = { code: string; file: string; id: string; url: string; invalidate: false };

function safeDecodeURI(id: string): string {
  try {
    return decodeURI(id);
  } catch {
    return id;
  }
}

/** The URL of a file of the build, by its path from the directory of the build. */
export function builtUrl(layer: BuiltLayer, file: string): string {
  return new URL(file.replace(/^\/+/, ""), layer.base).href;
}

/**
 * What the transport of a runner of a built layer answers, from the files of
 * the layers that `fetch` fetches: the first of `layers` at once, the others
 * when a runner asks. Every runner of a tab asks the same
 * one, which answers with the same object for a module every time: the code
 * is the same for every page, so `evaluatorIn()` in utils.ts compiles it
 * once.
 */
export function createBuiltLayers(fetch: typeof globalThis.fetch, layers: BuiltLayer[]) {
  // By the URL of the file of a layer.
  const fetched = new Map<string, Promise<Map<string, BuiltModule>>>();

  /** The modules of a layer, which the tab fetches once, now. */
  function modulesOf(layer: BuiltLayer): Promise<Map<string, BuiltModule>> {
    const url = builtUrl(layer, layer.modules);
    let modules = fetched.get(url);
    if (modules) return modules;
    // Its name does not change with its content: ask the server whether the
    // copy the browser has is still the one it serves. The page's preload of
    // the first layer, which this takes, asks in the default mode of the
    // cache: there the server's `no-cache` is what has the browser ask.
    modules = fetch(url, { cache: "no-cache" }).then(async (response) => {
      if (!response.ok) {
        throw new Error(`vitest-plugin-rsc: ${url} responded with ${response.status}`);
      }
      // A site that answers with a page of its own for a file it does not
      // have says so with this URL.
      const codes = (await response.json().catch((error: unknown) => {
        throw new Error(`vitest-plugin-rsc: ${url} is not the modules of a layer`, {
          cause: error,
        });
      })) as Record<string, string>;
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

  // A runner of the first layer gets an error of it.
  if (layers[0]) modulesOf(layers[0]).catch(() => {});

  /** What the transport of a runner of `layer` answers. */
  async function invoke(layer: BuiltLayer, payload: InvokePayload): Promise<InvokeResult> {
    const { name, data } = (payload as { data: { name: string; data: unknown[] } }).data;
    if (name === "getBuiltins") return { result: [] } as InvokeResult;
    if (name !== "fetchModule") {
      return { error: { message: `vitest-plugin-rsc: a build has no "${name}"` } } as InvokeResult;
    }
    const id = data[0] as string;
    try {
      const modules = await modulesOf(layer);
      // Also by a URL of it, which encodes what a path does not.
      const found = modules.get(id) ?? modules.get(safeDecodeURI(id));
      if (!found) throw new Error(`vitest-plugin-rsc: the build has no module ${id}`);
      return { result: found } as InvokeResult;
    } catch (error) {
      return {
        error: { message: String(error instanceof Error ? error.message : error) },
      } as InvokeResult;
    }
  }

  return { invoke };
}
