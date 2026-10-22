import { cleanup, handleRequest } from "vitest-plugin-rsc/nextjs/testing-library";
import { currentRequest } from "request-context";
import { expect, test } from "vitest";

// A package of the app that creates an `AsyncLocalStorage` of `async_hooks`,
// which the optimizer bundles, has the page's one: its store is entered with
// the request, carried across an `await` and reset between tests, as the
// stores of Next are.

test("reads the store a package entered for the request, after an await", async () => {
  const first = await handleRequest("/api/request-context?id=first");
  expect(await first.json()).toEqual({ id: "first" });
  const second = await handleRequest("/api/request-context?id=second");
  expect(await second.json()).toEqual({ id: "second" });
});

test("reads the store a package entered as the ssr layer renders", async () => {
  const html = await (await handleRequest("/request-context")).text();
  expect(html).toContain("<p>Request: rendered</p>");
});

test("resets the store a package entered between two tests", async () => {
  // `enterWith()` leaves the store entered when the request is over.
  const response = await handleRequest("/api/request-context?id=left&enter-with");
  expect(await response.json()).toEqual({ id: "left" });
  expect(currentRequest()).toBe("left");

  // What runs between two tests.
  await cleanup();

  expect(currentRequest()).toBeUndefined();
});
