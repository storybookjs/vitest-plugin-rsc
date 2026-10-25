import { PassThrough } from "node:stream";
import { expect, test, vi } from "vitest";
import {
  ForksPoolWorker,
  type PoolOptions,
  type PoolWorker,
  type WorkerRequest,
} from "vitest/node";
import { answerKey, questionKey } from "./page-protocol.ts";
import { createNodeHostPool } from "./worker-pool.ts";

// What `ForksPoolWorker` reads of the options: the logger's streams, which the
// worker's output goes to, and Vitest's own files, whose entry the pool's
// worker does not fork.
const options = {
  distPath: "/vitest/dist",
  project: {
    vitest: { logger: { outputStream: new PassThrough(), errorStream: new PassThrough() } },
  },
  execArgv: [],
  env: process.env,
} as unknown as PoolOptions;

const pool = createNodeHostPool(async (event, data) =>
  event === "echo" ? { result: { asked: data } } : undefined,
);

async function started(): Promise<PoolWorker> {
  const worker = pool.createPoolWorker(options);
  await worker.start();
  return worker;
}

test("names its workers as the pool, which Vitest gives the next file without isolation", () => {
  expect(pool.name).toBe("vitest-plugin-rsc");
  expect(pool.createPoolWorker(options).name).toBe(pool.name);
});

// The built entry, dist/workers/forks.js, which `pnpm test` builds first.
test("forks the plugin's entry, which answers Vitest's requests through Vitest's `init()`", async () => {
  const worker = await started();
  try {
    const answered = new Promise<unknown>((resolve) => worker.on("message", resolve));
    worker.send({ __vitest_worker_request__: true, type: "stop" } as WorkerRequest);
    // A stop before a start fails in the worker, and says so in its answer.
    expect(await answered).toMatchObject({ __vitest_worker_response__: true, type: "stopped" });
  } finally {
    await worker.stop();
  }
});

test("answers the page's questions, which Vitest does not hear", async () => {
  // The listeners of the worker's messages, as `ForksPoolWorker` adds them to
  // its process, which a message of the worker's process reaches.
  type Listener = (message: unknown) => void;
  const listeners = new Set<Listener>();
  const fromWorker = (message: unknown) => {
    for (const listener of listeners) listener(message);
  };
  const { on, off } = ForksPoolWorker.prototype;
  vi.spyOn(ForksPoolWorker.prototype, "on").mockImplementation(
    function (this: ForksPoolWorker, event, listener) {
      if (event === "message") listeners.add(listener);
      else on.call(this, event, listener);
    },
  );
  vi.spyOn(ForksPoolWorker.prototype, "off").mockImplementation(
    function (this: ForksPoolWorker, event, listener) {
      if (event === "message") listeners.delete(listener);
      else off.call(this, event, listener);
    },
  );
  const worker = await started();
  try {
    const heardByVitest = vi.fn();
    worker.on("message", heardByVitest);
    const sent = new Promise<unknown[]>((resolve) => {
      const answers: unknown[] = [];
      vi.spyOn(worker, "send").mockImplementation((message) => {
        // A result that the channel cannot carry, as a function.
        if (JSON.stringify(message).includes("uncloneable")) throw new Error("could not be cloned");
        answers.push(message);
        if (answers.length === 3) resolve(answers);
      });
    });

    fromWorker({ [questionKey]: 1, event: "echo", data: { a: 1 } });
    fromWorker({ [questionKey]: 2, event: "other", data: {} });
    fromWorker({ [questionKey]: 3, event: "echo", data: { uncloneable: true } });
    fromWorker({ __vitest_worker_response__: true, type: "started" });

    expect(await sent).toEqual([
      { [answerKey]: 1, result: { asked: { a: 1 } } },
      { [answerKey]: 2, error: "no answer at other" },
      { [answerKey]: 3, error: "Error: could not be cloned" },
    ]);
    expect(heardByVitest.mock.calls).toEqual([
      [{ __vitest_worker_response__: true, type: "started" }],
    ]);
    worker.off("message", heardByVitest);
    fromWorker({ __vitest_worker_response__: true, type: "started" });
    expect(heardByVitest).toHaveBeenCalledTimes(1);
  } finally {
    vi.restoreAllMocks();
    await worker.stop();
  }
});
