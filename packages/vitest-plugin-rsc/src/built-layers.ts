import type { ModuleRunnerTransport } from "vite/module-runner";

// A static build has no dev server to ask for a module. The environments that
// run through a module runner were built as Vite builds any environment, into
// chunks with a hash in their names, and every chunk was rewritten into the
// format the runner evaluates: see nextjs/static-build.ts. A manifest per
// layer says which chunks there are and what each imports.
//
// A tab fetches the manifest once. When a runner asks for a chunk the first
// time, the tab fetches that chunk and, at the same time, every chunk it
// imports, and theirs, as the manifest says: a page load waits for one round
// trip for the manifest and one for the chunks of its entry, not for one per
// level of imports. A chunk that is imported dynamically, like a Client
// Component of a route, is fetched when a page asks for it, with its imports.
// Every runner of the tab, like the one of each page load of the browser
// layer, evaluates from what the tab fetched. The id of a module is the path
// of its file from the directory of the build, so what it names by its URL,
// like its CSS, is where it says.

/** An environment that a static build made into chunks for the module runner. */
export type BuiltLayer = {
  /** The URL of the directory of the build, which ends in a slash. */
  base: string;
  /** The URL of the manifest of the layer: see `BuiltManifest`. */
  manifest: string;
};

/**
 * The manifest of a built layer, `vitest-plugin-rsc/<layer>/manifest.json`. A
 * file is the path of a chunk from the directory of the build, as the `file`
 * of an entry of Vite's own manifest is. The module runner has the chunk by
 * that path with a `/` in front of it, which is what a chunk imports another
 * one by.
 */
export type BuiltManifest = {
  /** The module the page imports by an id of its own, like `vitest-plugin-rsc/nextjs/ssr`. */
  entry: { id: string; file: string };
  /** Every chunk of the layer, by its file. */
  chunks: Record<
    string,
    {
      /** The chunks it imports statically, which it cannot run without. */
      imports: string[];
      /** The chunks it imports with `import()`, when it gets there. */
      dynamicImports: string[];
      /** Where it is, when Vite's `experimental.renderBuiltUrl` says so. */
      url?: string;
      /** Or the code that says where it is, which the page runs. */
      runtime?: string;
    }
  >;
};

type BuiltChunk = BuiltManifest["chunks"][string];

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

/**
 * The URL of a file of the build, by its path from the directory of the
 * build. Encoded: a file can have a name like `a#b-C3d4.js`.
 */
function builtUrl(layer: BuiltLayer, file: string): string {
  const path = file.replace(/^\/+/, "").split("/").map(encodeURIComponent).join("/");
  return new URL(path, layer.base).href;
}

// What runs the code of `renderBuiltUrl` that says where a chunk is: in the
// page, as a script that the config wrote it into would run it.
// oxlint-disable-next-line typescript/no-implied-eval, no-new-func
const runCode = (code: string) => String(new Function(`return (${code});`)());

/** A response of the site that is not the file it was asked for. */
async function failed(url: string, response: Response): Promise<Error | undefined> {
  if (!response.ok) return new Error(`vitest-plugin-rsc: ${url} responded with ${response.status}`);
  // A site that answers with a page of its own for a file it does not have,
  // like the `index.html` of an app that routes in the browser.
  if (/\btext\/html\b/.test(response.headers.get("content-type") ?? "")) {
    return new Error(`vitest-plugin-rsc: ${url} responded with a page, not a file of the build`);
  }
}

/**
 * What the transport of a runner of a built layer answers, from the chunks
 * that `fetch` fetches. Every runner of a tab asks the same one, which answers
 * with the same object for a module every time: the code is the same for
 * every page, so `pageLoadEvaluator` in utils.ts compiles it once.
 */
export function createBuiltLayers(fetch: typeof globalThis.fetch) {
  // By the URL of a manifest, and of a chunk. Those that have arrived, by the
  // URL of their manifest, for what has to be known right away.
  const manifests = new Map<string, Promise<BuiltManifest>>();
  const arrived = new Map<string, BuiltManifest>();
  const chunks = new Map<string, Promise<BuiltModule>>();

  // One that fails is not kept: the next page load asks again.
  function once<T>(cache: Map<string, Promise<T>>, url: string, get: () => Promise<T>): Promise<T> {
    let got = cache.get(url);
    if (got) return got;
    cache.set(url, (got = get()));
    got.catch(() => {
      if (cache.get(url) === got) cache.delete(url);
    });
    return got;
  }

  /** The manifest of a layer, which the tab fetches once. */
  function manifestOf(layer: BuiltLayer): Promise<BuiltManifest> {
    const url = layer.manifest;
    return once(manifests, url, async () => {
      // Its name does not change with its content: ask the server whether
      // the copy the browser has is still the one it serves.
      const response = await fetch(url, { cache: "no-cache" });
      const error = await failed(url, response);
      if (error) throw error;
      const manifest = (await response.json().catch((cause: unknown) => {
        throw new Error(`vitest-plugin-rsc: ${url} is not the manifest of a layer`, { cause });
      })) as BuiltManifest;
      if (!manifest?.entry || !manifest.chunks) {
        throw new Error(`vitest-plugin-rsc: ${url} is not the manifest of a layer`);
      }
      arrived.set(url, manifest);
      return manifest;
    });
  }

  /** A chunk of the manifest, by its file: not what every object has, like `constructor`. */
  const chunkIn = (manifest: BuiltManifest | undefined, file: string): BuiltChunk | undefined =>
    manifest && Object.hasOwn(manifest.chunks, file) ? manifest.chunks[file] : undefined;

  // The URLs that the code of the config said, once for each chunk.
  const ran = new Map<BuiltChunk, string>();

  /** Where a chunk of the layer is, by its file. */
  function urlOf(layer: BuiltLayer, manifest: BuiltManifest | undefined, file: string): string {
    const chunk = chunkIn(manifest, file);
    let url = chunk?.url;
    if (chunk?.runtime) {
      url = ran.get(chunk) ?? runCode(chunk.runtime);
      ran.set(chunk, url);
    }
    // One that is not absolute, like `/cdn/a.js`, from the directory of the
    // build, which is where the page is when it is on the same origin.
    return url ? new URL(url, layer.base).href : builtUrl(layer, file);
  }

  /** A chunk of the layer, by its file, which the tab fetches once. */
  function chunkOf(layer: BuiltLayer, manifest: BuiltManifest, file: string): Promise<BuiltModule> {
    const url = urlOf(layer, manifest, file);
    return once(chunks, url, async () => {
      // Its name changes with its content, so the copy the browser has is
      // the one: from its cache, as long as the site lets it keep one.
      const response = await fetch(url, { cache: "default" });
      const error = await failed(url, response);
      if (error) throw error;
      const code = await response.text();
      // Also one that does not say it is a page. No chunk starts with a tag.
      if (code.trimStart().startsWith("<")) {
        throw new Error(`vitest-plugin-rsc: ${url} responded with a page, not a file of the build`);
      }
      const id = `/${file}`;
      return { code, file: id, id, url: id, invalidate: false };
    });
  }

  /**
   * A chunk, fetched with every chunk it imports statically, all at once,
   * when it is asked for the first time. A runner asks for every import of
   * every module, also for one it has.
   */
  function load(layer: BuiltLayer, manifest: BuiltManifest, file: string): Promise<BuiltModule> {
    const asked = chunks.get(urlOf(layer, manifest, file));
    if (asked) return asked;
    const loaded = chunkOf(layer, manifest, file);
    const closure = new Set<string>([file]);
    const visit = (imported: string) => {
      if (closure.has(imported)) return;
      closure.add(imported);
      // A runner that asks for it gets the error.
      chunkOf(layer, manifest, imported).catch(() => {});
      chunkIn(manifest, imported)?.imports.forEach(visit);
    };
    chunkIn(manifest, file)?.imports.forEach(visit);
    return loaded;
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
      const manifest = await manifestOf(layer);
      // Also by a URL of it, which encodes what a path does not.
      const file = [id, safeDecodeURI(id)]
        .map((path) => path.replace(/^\//, ""))
        .find((path) => chunkIn(manifest, path));
      if (!file) throw new Error(`vitest-plugin-rsc: the build has no module ${id}`);
      return { result: await load(layer, manifest, file) } as InvokeResult;
    } catch (error) {
      return {
        error: { message: String(error instanceof Error ? error.message : error) },
      } as InvokeResult;
    }
  }

  return {
    invoke,
    /**
     * What a runner imports a module of the layer by, that the page imports
     * by `id`: the file of the entry, for the entry. A runner resolves a
     * relative `import()` against it.
     */
    async moduleOf(layer: BuiltLayer, id: string): Promise<string> {
      const { entry } = await manifestOf(layer);
      return entry.id === id ? `/${entry.file}` : id;
    },
    /**
     * The URL of a module of the layer, by its id: the URL of its chunk. A
     * runner asks once it has the module, so the manifest has arrived.
     */
    urlOf(layer: BuiltLayer, id: string): string {
      return urlOf(layer, arrived.get(layer.manifest), id.replace(/^\//, ""));
    },
    /** Has the tab fetch the manifest of a layer and its entry now, before a runner asks. */
    preload(layer: BuiltLayer): void {
      // A runner that asks gets the error.
      manifestOf(layer)
        .then((manifest) => load(layer, manifest, manifest.entry.file))
        .catch(() => {});
    },
  };
}
