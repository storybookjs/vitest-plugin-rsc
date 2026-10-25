import type { RuntimeRPC, WorkerGlobalState } from "vitest";

// What the plugin's worker entry (workers/forks.ts) hands the page's runtime
// in a worker of Node.js, as Vitest runs a test file there: Vitest's own RPC
// to the dev server, whose `fetch()` answers for any environment of the
// project, and the context of the run, which names the files that changed
// since the last one. Nothing in a browser, or in a worker of another entry.

/** The key of the run on `globalThis`, which the worker's entry sets. */
export const workerRunKey = Symbol.for("vitest-plugin-rsc:worker-run");

export type WorkerRun = {
  rpc: Pick<RuntimeRPC, "fetch">;
  ctx: Pick<WorkerGlobalState["ctx"], "invalidates">;
};

/** The run of this worker of Node.js, from the plugin's worker entry. */
export function workerRun(): WorkerRun | undefined {
  return (globalThis as unknown as Record<PropertyKey, WorkerRun | undefined>)[workerRunKey];
}
