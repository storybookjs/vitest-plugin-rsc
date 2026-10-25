import type { InvokePayload, InvokeResult } from "./built-layers.ts";
import type { PageModules } from "./page-host.ts";
import { invokeEvent } from "./page-protocol.ts";
import { askOverWorkerChannel } from "./worker-channel.ts";
import { builtinsKey, workerRun, type ProvidedBuiltins, type WorkerRun } from "./worker-run.ts";

// The modules of the page's layers in a worker of Node.js, like next_ssr and
// react_client, from Vitest's own RPC: `fetch()` answers for any environment
// of the project, as for the test's own modules, from Vitest's transform
// cache on disk where it has them (`fsModuleCache`). One question a module,
// in the order the runner asks. Their versions are the dev server's, which
// the page asks on the worker's channel: see `versionOfModules()` in utils.ts.

// Not an import, which the rsc layer would resolve as a module of the app's.
const fs = process.getBuiltinModule("node:fs");

type FetchArgs = [url: string, importer?: string, options?: { cached?: boolean }];
type Fetched = Awaited<ReturnType<WorkerRun["rpc"]["fetch"]>>;

/** The modules of the page's layers, from the run of the worker's entry. */
export function vitestModules(): PageModules {
  return {
    invoke: async (environment, payload) => invoke(run(), environment, payload),
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
    const fetched = await rpc.fetch(url, importer, environment, options);
    // Vitest leaves a file of a dependency to Node.js, as `server.deps` of the
    // project says for every environment: in a layer of the page that would
    // be a second instance of the package next to the layer's, like a second
    // React, without the layer's conditions. The dev server's environment
    // answers it in the layer, as it does for a page in a browser.
    if ("externalize" in fetched && fetched.externalize.includes("/node_modules/")) {
      return (await askOverWorkerChannel(invokeEvent, { environment, payload })) as InvokeResult;
    }
    return { result: answerOf(fetched) };
  } catch (error) {
    return { error };
  }
}

// What Vite's runner takes: the code of a module that Vitest has on disk,
// read as Vitest's own runner reads it.
function answerOf(fetched: Fetched) {
  if ("cached" in fetched && fetched.cached) {
    const { tmp, cached: _, ...module } = fetched;
    return { ...module, code: fs.readFileSync(tmp, "utf8") };
  }
  return fetched;
}
