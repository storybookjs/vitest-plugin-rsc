import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { DevEnvironment } from "vite";
import type { CacheKeyIdGenerator, TestProject } from "vitest/node";
import { invalidatedAt } from "./module-versions.ts";

// What a runner of a page in a browser gets for a module of a layer, over
// the page's socket: the module as Vitest's transform cache has it
// (`fsModuleCache`), which keeps what Vite compiled on disk for the next run,
// where Vite's own `fetchModule()` compiles every module again in every run.
// Vitest answers for any environment of the project's dev server, through
// the same `fetch()` as for its own runner. Without the cache, outside a test
// run of Vitest, like `storybook dev`, and for a page in a worker of Node.js,
// Vite answers, as before.

type InvokePayload = Parameters<DevEnvironment["hot"]["handleInvoke"]>[0];
type InvokeResult = Awaited<ReturnType<DevEnvironment["hot"]["handleInvoke"]>>;
type FetchOptions = { cached?: boolean; startOffset?: number };

/** What Vitest's `fetch()` answers, by what it has of the module. */
type CachedFetchResult =
  // On disk, at `tmp`.
  | { cached: true; tmp: string; file: string | null; id: string; url: string; invalidate: boolean }
  // Compiled, without a place on disk: a module that Vitest does not cache.
  | { code: string; file: string | null; id: string; url: string; invalidate: boolean }
  // What the runner says it has already.
  | { cache: true }
  // A module that Vitest's own runner would leave to Node.js.
  | { externalize: string; type: string };

type CachedFetch = (
  url: string,
  importer: string | undefined,
  environment: string,
  options?: FetchOptions,
) => Promise<CachedFetchResult>;

// By the environment: the server that `configureServer` gets is another
// object than the project's `vite`, of the same environments.
const fetchOf = new WeakMap<DevEnvironment, CachedFetch>();
// The environments of a project whose cache has a module by a key without
// what a plugin adds: Vite answers for them.
const unkeyed = new WeakSet<DevEnvironment>();

// What of Vitest a project of an instance of Browser Mode needs for its key:
// Vitest's own, not public.
type InstanceInternals = {
  _parent?: TestProject;
  vitest: {
    cache: {
      _modules?: {
        defineCacheKeyGenerator?: (config: object, generate: CacheKeyIdGenerator) => void;
      };
    };
  };
};

/**
 * Has Vitest's transform cache key what it compiles for `project` by
 * `generate` too, where `define` is the `defineCacheKeyGenerator` that
 * Vitest gives the project's `configureVitest`. A project of an instance of
 * Browser Mode, like `chromium`, compiles through the transform service of
 * the project it is an instance of, which keys a module by that project's
 * config, where `define` adds to the instance's: so the key goes to that
 * config too. Where it cannot, the page's runners get every module from
 * Vite (`invokeEnvironment()`).
 */
export function defineTransformCacheKey(
  project: TestProject,
  define: ((generate: CacheKeyIdGenerator) => void) | undefined,
  generate: CacheKeyIdGenerator,
): void {
  define?.(generate);
  const { _parent: parent, vitest } = project as unknown as InstanceInternals;
  if (!parent) return;
  const cache = vitest.cache._modules;
  if (cache?.defineCacheKeyGenerator) return cache.defineCacheKeyGenerator(parent.config, generate);
  for (const environment of Object.values(project.vite.environments)) {
    unkeyed.add(environment);
    fetchOf.delete(environment);
  }
}

/**
 * Answers the runners of a page in a browser from Vitest's transform cache,
 * for the environments of the project's dev server, from now on: see
 * `invokeEnvironment()`. Nothing where the project has the cache off.
 */
export async function answerFromTransformCache(project: TestProject): Promise<void> {
  const environments = Object.values(project.vite.environments).filter(
    (environment) => !unkeyed.has(environment) && !fetchOf.has(environment),
  );
  if (!project.config.fsModuleCache || environments.length === 0) return;
  // Of the Vitest that runs the project, by the path of its build: the
  // plugin does not import Vitest, an optional peer dependency, but for
  // the setup files (optional-vitest.test.ts).
  const vitestNode = pathToFileURL(path.join(project.vitest.distPath, "node.js")).href;
  const { createMethodsRPC } = (await import(vitestNode)) as typeof import("vitest/node");
  const { fetch } = createMethodsRPC(project);
  for (const environment of environments) {
    if (!unkeyed.has(environment)) fetchOf.set(environment, fetch as CachedFetch);
  }
}

/**
 * What `environment` answers to an invoke of a runner of the page: a
 * `fetchModule` from Vitest's transform cache, and what Vitest has not,
 * everything else and an error from Vite. The answer is Vite's in shape: the
 * module's code and not the place of its file, which the page cannot read in
 * a browser.
 */
export async function invokeEnvironment(
  environment: DevEnvironment,
  payload: InvokePayload,
): Promise<InvokeResult> {
  const fetch = fetchOf.get(environment);
  const { name, data } = (payload as { data: { name: string; data: unknown[] } }).data;
  if (!fetch || name !== "fetchModule") return environment.hot.handleInvoke(payload);
  const [url, importer, options] = data as [string, string | undefined, FetchOptions?];
  const cached = await fromCache(fetch, environment, url, importer, options).catch(() => {});
  if (cached) return { result: cached } as InvokeResult;
  const answer = await environment.hot.handleInvoke(payload);
  // Vite answers a module that Vitest compiled in the run with Vitest's
  // code: its map, without the runner's lines.
  const fetched = (answer as { result?: { code?: unknown; id?: unknown } }).result;
  if (typeof fetched?.code === "string" && typeof fetched.id === "string") {
    fetched.code = withLinesBefore(fetched.code, options?.startOffset ?? 0, fetched.id);
  }
  return answer;
}

async function fromCache(
  fetch: CachedFetch,
  environment: DevEnvironment,
  url: string,
  importer: string | undefined,
  options: FetchOptions | undefined,
) {
  // A specifier like a page's entry by its package resolves from its
  // importer, as Vitest's `fetch()` resolves it; Vite answers what does not.
  const id = url.startsWith("/")
    ? unwrapId(url)
    : (await environment.pluginContainer.resolveId(url, importer))?.id;
  if (!id) return;
  // Vitest keys a module by its file as it first read it in a run, and
  // forgets that key only for a change that its own watcher sees. Vite
  // compiles a module again after any invalidation: a change of its file, of
  // a module it imports, or a new bundle of the optimizer, whose versions are
  // in the URLs that the code imports. Such a module is Vite's to answer, for
  // the rest of the run. The module as Vite and Vitest find it next.
  const graph = environment.moduleGraph;
  const node = await graph.ensureEntryFromUrl(id);
  if (invalidatedAt(node) > 0) return;
  const result = await fetch(url, importer, environment.name, options);
  // An invalidation while Vitest read its file: Vitest gave the module the
  // code of before it, which Vite would keep.
  if (invalidatedAt(node) > 0) {
    graph.invalidateModule(node);
    return;
  }
  // Vite answers it as it always did: a builtin, a URL of the network, or a
  // dependency that is not inlined, which Vitest would leave to Node.js.
  if ("externalize" in result) return;
  if ("cache" in result) return result;
  const code = "tmp" in result ? await readFile(result.tmp, "utf8") : result.code;
  const { file, url: moduleUrl, invalidate } = result;
  return {
    code: withLinesBefore(code, options?.startOffset ?? 0, result.id),
    file,
    id: result.id,
    url: moduleUrl,
    invalidate,
  };
}

// The id of a module by the URL that its importer's code has, as Vite's
// `fetchModule()` reads it: import analysis writes a resolved id that is no
// URL, like a virtual module's, as `/@id/`.
const unwrapId = (url: string) =>
  url.startsWith("/@id/") ? url.slice("/@id/".length).replace("__x00__", "\0") : url;

// The source map that Vite and Vitest put in the code of a module for a
// runner, last. Vite names the module on the line before it.
const inlineMapRE =
  /\n\/\/# sourceMappingSource=vite-generated\n\/\/# sourceMappingURL=data:application\/json;base64,([A-Za-z0-9+/=]+)\n/g;

/**
 * The code of the module `id` with its source map for a runner that puts
 * `lines` lines before the code, as Vite gives it with the runner's
 * `startOffset`, and in Vite's form, which names the module before the map:
 * Vitest's runner puts no lines before the code, so its cache has the map of
 * the code as it is, and no name. A map in Vite's form has the lines already.
 * A dependency comes without a map, see `dependencySourceMapPlugin()` in
 * index.ts.
 */
export function withLinesBefore(code: string, lines: number, id: string): string {
  const inline = lines > 0 ? [...code.matchAll(inlineMapRE)].at(-1) : undefined;
  if (!inline) return code;
  const lineBefore = code.slice(code.lastIndexOf("\n", inline.index - 1) + 1, inline.index);
  if (lineBefore.startsWith("//# sourceURL=")) return code;
  const map = JSON.parse(Buffer.from(inline[1]!, "base64").toString("utf8")) as {
    mappings: string;
  };
  map.mappings = ";".repeat(lines) + map.mappings;
  const shifted = Buffer.from(JSON.stringify(map)).toString("base64");
  // Not the comment of a map in one piece in this file: Vitest reads the
  // last such comment of a module it caches as its map, also one in a string.
  const comments =
    `\n//# sourceURL=${id}\n//# sourceMappingSource=vite-generated\n` +
    `//# ${"sourceMappingURL"}=data:application/json;base64,${shifted}\n`;
  return `${code.slice(0, inline.index)}${comments}${code.slice(inline.index + inline[0].length)}`;
}
