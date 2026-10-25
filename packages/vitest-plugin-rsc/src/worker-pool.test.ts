import type { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { expect, test, vi } from "vitest";
import type { PoolOptions, PoolWorker, WorkerRequest } from "vitest/node";
import { answerKey, questionKey } from "./page-protocol.ts";
import { createNodeHostPool } from "./worker-pool.ts";

// What `ForksPoolWorker` reads of the options: the logger's streams, which the
// worker's output goes to.
const options = {
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

// A message of the worker's process, as Vitest's process hears it.
const fromWorker = (worker: PoolWorker, message: unknown) =>
  (worker as unknown as { fork: EventEmitter }).fork.emit("message", message);

test("names a pool of its own, which Vitest asks for its workers", () => {
  expect(pool.name).toBe("vitest-plugin-rsc");
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
  const worker = await started();
  try {
    const heardByVitest = vi.fn();
    worker.on("message", heardByVitest);
    const sent = new Promise<unknown[]>((resolve) => {
      const answers: unknown[] = [];
      vi.spyOn(worker, "send").mockImplementation((message) => {
        answers.push(message);
        if (answers.length === 2) resolve(answers);
      });
    });

    fromWorker(worker, { [questionKey]: 1, event: "echo", data: { a: 1 } });
    fromWorker(worker, { [questionKey]: 2, event: "other", data: {} });
    fromWorker(worker, { __vitest_worker_response__: true, type: "started" });

    expect(await sent).toEqual([
      { [answerKey]: 1, result: { asked: { a: 1 } } },
      { [answerKey]: 2, error: "no answer at other" },
    ]);
    expect(heardByVitest.mock.calls).toEqual([
      [{ __vitest_worker_response__: true, type: "started" }],
    ]);
    worker.off("message", heardByVitest);
    fromWorker(worker, { __vitest_worker_response__: true, type: "started" });
    expect(heardByVitest).toHaveBeenCalledTimes(1);
  } finally {
    vi.restoreAllMocks();
    await worker.stop();
  }
});
