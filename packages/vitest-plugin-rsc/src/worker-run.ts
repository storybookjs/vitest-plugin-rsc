import type { RuntimeRPC } from "vitest";

// What the plugin's worker entry (workers/forks.ts) hands the page's runtime
// in a worker of Node.js, as Vitest runs test files there: Vitest's own RPC
// to the dev server, whose `fetch()` answers for any environment of the
// project, and what the project provides. Nothing in a browser.

/** The key of the run on `globalThis`, which the worker's entry sets. */
export const workerRunKey = Symbol.for("vitest-plugin-rsc:worker-run");

export type WorkerRun = {
  rpc: Pick<RuntimeRPC, "fetch">;
  /** What the project provides, as `inject()` of Vitest has it. */
  providedContext: Record<string, unknown>;
};

/**
 * What the plugin provides the worker (`project.provide()`, index.ts): the
 * modules that a runner of each environment leaves to Node.js, as the
 * environment's `getBuiltins` answers them, which Vitest's RPC does not.
 */
export const builtinsKey = "vitest-plugin-rsc:builtins";
export type ProvidedBuiltins = Record<
  string,
  ({ type: "string"; value: string } | { type: "RegExp"; source: string; flags: string })[]
>;

/** The run of this worker of Node.js, from the plugin's worker entry. */
export function workerRun(): WorkerRun | undefined {
  return (globalThis as unknown as Record<PropertyKey, WorkerRun | undefined>)[workerRunKey];
}
