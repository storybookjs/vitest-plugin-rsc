import { init, runBaseTests, setupEnvironment } from "vitest/worker";
import type { WorkerRun } from "../worker-run.ts";

// The entry of a worker of Node.js whose page the plugin hosts: Vitest's own
// entry of its forks pool, over the public `init()` of `vitest/worker`
// (`@experimental`), and one thing more: the page's runtime gets Vitest's RPC
// and the context of the run, see worker-run.ts. Vitest's `ForksPoolWorker`
// forks it as `<distPath>/workers/forks.js`: see worker-pool.ts.

// `workerRunKey` of worker-run.ts: this file imports no module of the page.
const workerRunKey = Symbol.for("vitest-plugin-rsc:worker-run");

if (!process.send) {
  throw new Error("vitest-plugin-rsc: the worker's entry runs in a process that Vitest forked");
}
// As a test may replace them.
const processExit = process.exit.bind(process);
const processSend = process.send.bind(process);
const processOn = process.on.bind(process);
const processOff = process.off.bind(process);
const processRemoveAllListeners = process.removeAllListeners.bind(process);

// As Vitest's entry: a profile is written as the process exits, which a
// SIGTERM would skip (nodejs/node#55094).
if (
  process.execArgv.some((arg) =>
    ["--prof", "--cpu-prof", "--heap-prof", "--diagnostic-dir"].some((flag) =>
      arg.startsWith(flag),
    ),
  )
) {
  processOn("SIGTERM", () => processExit());
}

// A worker whose channel to Vitest closed exits, where it would try to send
// the error of that too.
const onError = (error: NodeJS.ErrnoException) => {
  if (error?.code === "ERR_IPC_CHANNEL_CLOSED" || error?.code === "EPIPE") processExit(1);
};
processOn("error", onError);

const handOver = ({ rpc, ctx }: WorkerRun) => {
  (globalThis as unknown as Record<PropertyKey, WorkerRun>)[workerRunKey] = { rpc, ctx };
};

init({
  post: (message) => processSend(message),
  on: (listener) => processOn("message", listener),
  off: (listener) => processOff("message", listener),
  teardown: () => {
    processRemoveAllListeners("message");
    processOff("error", onError);
    // A test's guard of `process.exit` stays between the files of a worker
    // without isolation, as in Vitest's entry.
    process.exit = processExit;
  },
  runTests: (state, traces) => {
    handOver(state);
    return runBaseTests("run", state, traces);
  },
  collectTests: (state, traces) => {
    handOver(state);
    return runBaseTests("collect", state, traces);
  },
  setup: setupEnvironment,
});
