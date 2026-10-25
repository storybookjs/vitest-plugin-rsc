import { PassThrough } from "node:stream";
import { expect, test } from "vitest";
import type { PoolOptions, WorkerRequest } from "vitest/node";
import { nodeHostPool } from "./worker-pool.ts";

// What `ForksPoolWorker` reads of the options: the logger's streams, which the
// worker's output goes to.
const options = {
  project: {
    vitest: { logger: { outputStream: new PassThrough(), errorStream: new PassThrough() } },
  },
  execArgv: [],
  env: process.env,
} as unknown as PoolOptions;

test("names a pool of its own, which Vitest asks for its workers", () => {
  expect(nodeHostPool.name).toBe("vitest-plugin-rsc");
  expect(nodeHostPool.name).not.toBe("forks");
});

// The built entry, dist/workers/forks.js, which `pnpm test` builds first.
test("forks the plugin's entry, which answers Vitest's requests through Vitest's `init()`", async () => {
  const worker = nodeHostPool.createPoolWorker(options);
  await worker.start();
  try {
    const answered = new Promise<unknown>((resolve) => worker.on("message", resolve));
    worker.send({ __vitest_worker_request__: true, type: "stop" } as WorkerRequest);
    // A stop before a start fails in the worker, and says so in its answer.
    expect(await answered).toMatchObject({ __vitest_worker_response__: true, type: "stopped" });
  } finally {
    await worker.stop();
  }
});
