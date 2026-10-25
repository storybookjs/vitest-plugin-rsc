import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { DevEnvironment, ViteDevServer } from "vite";
import type { TestProject } from "vitest/node";
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

const fetchOf = new WeakMap<ViteDevServer, CachedFetch>();

/**
 * Answers the runners of a page in a browser from Vitest's transform cache,
 * for the environments of the project's dev server, from now on: see
 * `invokeEnvironment()`. Nothing where the project has the cache off.
 */
export async function answerFromTransformCache(project: TestProject): Promise<void> {
  if (!project.config.fsModuleCache || fetchOf.has(project.vite)) return;
  // Of the Vitest that runs the project, by the path of its build: the
  // plugin does not import Vitest, an optional peer dependency, but for
  // the setup files (optional-vitest.test.ts).
  const vitestNode = pathToFileURL(path.join(project.vitest.distPath, "node.js")).href;
  const { createMethodsRPC } = (await import(vitestNode)) as typeof import("vitest/node");
  const { fetch } = createMethodsRPC(project);
  fetchOf.set(project.vite, fetch as CachedFetch);
}

/**
 * What the environment of `server` answers to an invoke of a runner of the
 * page: a `fetchModule` from Vitest's transform cache, and what Vitest has
 * not, everything else and an error from Vite. The answer is Vite's in shape:
 * the module's code and not the place of its file, which the page cannot
 * read in a browser.
 */
export async function invokeEnvironment(
  server: ViteDevServer,
  environment: DevEnvironment,
  payload: InvokePayload,
): Promise<InvokeResult> {
  const fetch = fetchOf.get(server);
  const { name, data } = (payload as { data: { name: string; data: unknown[] } }).data;
  if (fetch && name === "fetchModule") {
    const [url, importer, options] = data as [string, string | undefined, FetchOptions?];
    const result = await fromCache(fetch, environment, url, importer, options).catch(() => {});
    if (result) return { result } as InvokeResult;
  }
  return environment.hot.handleInvoke(payload);
}

async function fromCache(
  fetch: CachedFetch,
  environment: DevEnvironment,
  url: string,
  importer: string | undefined,
  options: FetchOptions | undefined,
) {
  // Vitest keys a module by its file as it first read it in a run, and
  // forgets that key only for a change that its own watcher sees. Vite
  // compiles a module again after any invalidation: a change of its file, of
  // a module it imports, or a new bundle of the optimizer, whose versions are
  // in the URLs that the code imports. Such a module is Vite's to answer, for
  // the rest of the run.
  const node = await environment.moduleGraph.getModuleByUrl(url);
  if (node && invalidatedAt(node) > 0) return;
  const result = await fetch(url, importer, environment.name, options);
  // Vite answers it as it always did: a builtin, a URL of the network, or a
  // dependency that is not inlined, which Vitest would leave to Node.js.
  if ("externalize" in result) return;
  if ("cache" in result) return result;
  const code = "tmp" in result ? await readFile(result.tmp, "utf8") : result.code;
  const { file, id, url: moduleUrl, invalidate } = result;
  return {
    code: withLinesBefore(code, options?.startOffset ?? 0),
    file,
    id,
    url: moduleUrl,
    invalidate,
  };
}

// The source map that Vite puts in the code of a module for a runner, last,
// as Vitest keeps it too.
const inlineMapRE =
  /\n\/\/# sourceMappingSource=vite-generated\n\/\/# sourceMappingURL=data:application\/json;base64,([A-Za-z0-9+/=]+)\n/;

/**
 * The code with its source map for a runner that puts `lines` lines before
 * the code, as Vite gives it with the runner's `startOffset`: Vitest's runner
 * puts none, so its cache has the map of the code as it is. A dependency
 * comes without a map, see `dependencySourceMapPlugin()` in index.ts.
 */
export function withLinesBefore(code: string, lines: number): string {
  const inline = lines > 0 ? inlineMapRE.exec(code) : null;
  if (!inline) return code;
  const map = JSON.parse(Buffer.from(inline[1]!, "base64").toString("utf8")) as {
    mappings: string;
  };
  map.mappings = ";".repeat(lines) + map.mappings;
  const shifted = Buffer.from(JSON.stringify(map)).toString("base64");
  const start = inline.index + inline[0].length - inline[1]!.length - 1;
  return `${code.slice(0, start)}${shifted}${code.slice(start + inline[1]!.length)}`;
}
