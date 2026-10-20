import { cleanup, handleRequest, renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { slowWork } from "../lib/slow-work.ts";

// The server handles one request at a time, and what a request reads, like its
// cookies, is what the request at work has. Code of a request that goes on
// after its test would read what the requests of the next test have.

test("leaving waits for a request that the server has not answered yet", async () => {
  Object.assign(slowWork, { duration: 300, started: 0, finished: 0, rendered: 0 });
  const response = handleRequest("/api/slow-work", {
    method: "POST",
    headers: { cookie: "session=ada" },
  });
  // The first request to the route loads its code, which takes a while when
  // every core runs a worker. It waits as long as a page load in leave.test.tsx.
  await expect.poll(() => slowWork.started, { timeout: 10_000 }).toBe(1);

  // What ends a test.
  await cleanup();

  expect(slowWork.finished).toBe(1);
  expect(await (await response).json()).toEqual({ session: "ada" });
});

test("leaving waits for a Server Action, and for the page that Next renders after it", async () => {
  Object.assign(slowWork, { duration: 300, started: 0, finished: 0, rendered: 0 });
  await renderServer({ url: "/slow-work" });
  await page.getByRole("button", { name: "Work slowly" }).click();
  await expect.poll(() => slowWork.started).toBe(1);

  await cleanup();

  expect(slowWork.finished).toBe(1);
  // Nothing of it goes on after that.
  const { rendered } = slowWork;
  await new Promise((resolve) => setTimeout(resolve, 400));
  expect(slowWork.rendered).toBe(rendered);
});
