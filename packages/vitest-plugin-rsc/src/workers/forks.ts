// Node's own web APIs, kept for the server's layers before Vitest sets up
// the environment, whose DOM replaces them: see worker-web-apis.ts.
import "../worker-web-apis.ts";
import type { WorkerGlobalState } from "vitest";
import { init, runBaseTests, setupEnvironment } from "vitest/worker";
import { isAnswer } from "../page-protocol.ts";
import type { WorkerRun } from "../worker-run.ts";

// The entry of a worker of Node.js whose page the plugin hosts: Vitest's own
// entry of its forks pool, over the public `init()` of `vitest/worker`
// (`@experimental`). And the page's: as a run starts, the page's runtime gets
// Vitest's RPC and what the run says (worker-run.ts), and the answers to its
// questions on the worker's channel are its own, which Vitest does not hear
// (worker-channel.ts). Vitest's `ForksPoolWorker` forks it as
// `<distPath>/workers/forks.js`: see worker-pool.ts.

// `workerRunKey` of worker-run.ts, whose module is the page's.
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

// One object for the worker: the files that changed are the worker's, also
// those of a run without a page.
const handOver = ({ rpc, ctx }: WorkerGlobalState) => {
  const scope = globalThis as unknown as Record<PropertyKey, WorkerRun | undefined>;
  const run = (scope[workerRunKey] ??= { rpc, providedContext: {}, changed: [] });
  run.rpc = rpc;
  run.providedContext = ctx.providedContext;
  if (ctx.invalidates?.length) run.changed.push(ctx.invalidates);
};

// Vitest's listeners of messages, as they hear them: without the answers to
// the page's questions (worker-channel.ts).
type Listener = (message: unknown) => void;
const vitestListeners = new WeakMap<Listener, Listener>();
const heardByVitest = (listener: Listener) => {
  let heard = vitestListeners.get(listener);
  if (!heard) {
    heard = (message) => {
      if (!isAnswer(message)) listener(message);
    };
    vitestListeners.set(listener, heard);
  }
  return heard;
};

init({
  post: (message) => processSend(message),
  on: (listener) => processOn("message", heardByVitest(listener)),
  off: (listener) => processOff("message", heardByVitest(listener)),
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
