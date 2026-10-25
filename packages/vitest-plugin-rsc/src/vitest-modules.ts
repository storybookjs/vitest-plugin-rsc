import type { InvokePayload, InvokeResult } from "./built-layers.ts";
import type { PageModules } from "./page-host.ts";
import { builtinsKey, workerRun, type ProvidedBuiltins, type WorkerRun } from "./worker-run.ts";

// The modules of the page's layers in a worker of Node.js, like next_ssr and
// react_client, from Vitest's own RPC: `fetch()` answers for any environment
// of the project, as for the test's own modules, from Vitest's transform
// cache on disk where it has them (`fsModuleCache`). One question a module,
// in the order the runner asks, without the dev server's news: a change of a
// file reaches the page as it reaches the test's modules, at the next run,
// which names the files that changed. The version of the modules is how
// many runs of the worker named some.

// Not an import, which the rsc layer would resolve as a module of the app's.
const fs = process.getBuiltinModule("node:fs");

type FetchArgs = [url: string, importer?: string, options?: { cached?: boolean }];
type Fetched = Awaited<ReturnType<WorkerRun["rpc"]["fetch"]>>;

/** The modules of the page's layers, from the run of the worker's entry. */
export function vitestModules(): PageModules {
  return {
    invoke: (environment, payload) => invoke(run(), environment, payload),
    version: () => run().changed.length,
    changedAfter: (version) => run().changed.slice(version).flat(),
  };
}

function run(): WorkerRun {
  const current = workerRun();
  if (current) return current;
  throw new Error(
    "vitest-plugin-rsc: a page in a worker of Node.js runs in the plugin's pool, whose entry " +
      "hands it Vitest's RPC, and this worker has none: does a plugin after vitest-plugin-rsc " +
      "set `test.pool`?",
  );
}

async function invoke(
  { rpc, providedContext }: WorkerRun,
  environment: string,
  payload: InvokePayload,
): Promise<InvokeResult> {
  const { name, data } = (payload as { data: { name: string; data: unknown[] } }).data;
  try {
    // Vite's runner asks for these once.
    if (name === "getBuiltins") {
      const builtins = providedContext[builtinsKey] as ProvidedBuiltins | undefined;
      return { result: builtins?.[environment] ?? [] };
    }
    if (name !== "fetchModule") throw new Error(`no answer for ${name}`);
    const [url, importer, options] = data as FetchArgs;
    return { result: answerOf(environment, await rpc.fetch(url, importer, environment, options)) };
  } catch (error) {
    return { error };
  }
}

// What Vite's runner takes: the code of a module that Vitest has on disk,
// read as Vitest's own runner reads it.
function answerOf(environment: string, fetched: Fetched) {
  if ("cached" in fetched && fetched.cached) {
    const { tmp, cached: _, ...module } = fetched;
    return { ...module, code: fs.readFileSync(tmp, "utf8") };
  }
  if ("externalize" in fetched && fetched.type === "module") {
    const dependency = packageOf(fetched.externalize);
    if (dependency) throw new Error(externalizedDependency(environment, dependency));
  }
  return fetched;
}

// The package of a file in node_modules: the last `node_modules/<name>/` of
// its path, where pnpm has `.pnpm/` first.
function packageOf(file: string): string | undefined {
  return [...file.matchAll(/\/node_modules\/((?:@[^/]+\/)?[^/.][^/]*)\//g)].at(-1)?.[1];
}

// Vitest leaves a file of a dependency to Node.js, as `server.deps` of the
// project says, for every environment: in a layer of the page that would be
// a second instance of the package next to the layer's, like a second React,
// with the conditions of Node.js and not the layer's.
function externalizedDependency(environment: string, dependency: string): string {
  return (
    `vitest-plugin-rsc: the ${environment} layer of the page imports a file of ${dependency}, ` +
    `which Vitest leaves to Node.js by \`server.deps\` of the project: the page would have a ` +
    `second instance of it, without the layer's conditions. Pre-bundle it for the layer with ` +
    `\`environments.${environment}.optimizeDeps.include: [${JSON.stringify(dependency)}]\`, or ` +
    `inline it with \`test.server.deps.inline: [${JSON.stringify(dependency)}]\`.`
  );
}
