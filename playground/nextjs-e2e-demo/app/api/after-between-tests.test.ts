import { expect, test } from "vitest";
import { cleanup, handleRequest } from "vitest-plugin-rsc/nextjs/testing-library";
import { auditLog } from "../lib/audit.ts";

test("waits between two tests for an after() that outlasts its test, which reads its own request", async () => {
  auditLog.length = 0;
  document.cookie = "who=first";
  // Work after the response that takes longer than a request waits for it.
  await (await handleRequest("/api/slow-after?ms=1500")).text();
  expect(auditLog).toEqual([]);

  // What runs between two tests.
  await cleanup();

  expect(auditLog).toEqual(["slow after() read first"]);
  document.cookie = "who=second";
  await (await handleRequest("/api/slow-after")).text();
  await expect
    .poll(() => auditLog)
    .toEqual(["slow after() read first", "slow after() read second"]);
});
