import { handleRequest, renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { beforeEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { auditLog } from "./lib/audit.ts";

// The stores of AsyncLocalStorage that a Server Action and the render after
// it read, in an app without "use cache". The async functions of the app are
// compiled to put their stores back after an `await`, and take them as they
// are when the function is called: see "The Scope Of A Cached Function" in
// docs/next-routes.md.

beforeEach(() => {
  auditLog.length = 0;
});

test("lets a promise of a Server Action, passed to after(), read the request once the action is done", async () => {
  // On Node.js the promise has the action's stores across its `await`, also
  // once Next has left the action's store with `exit()` to render the page
  // after it. Here the promise is compiled, and takes the stores it was
  // started with, before that `exit()`.
  await renderServer({
    url: "/after-action",
    headers: { cookie: "who=ada", "x-client": "vitest" },
  });

  await page.getByRole("button", { name: "Audit later" }).click();

  await expect.poll(() => auditLog).toEqual(["after the action: ada with vitest"]);
});

// The two tests below guard what compiling every app could break, and
// passed before it too.

test("still sends a cookie that a compiled Server Action sets after an await of its own", async () => {
  // On Node.js the action has its request store after the `await`, and Next
  // sends what it set with the response. Here the action is compiled, and
  // puts back the store it was called with, which is that one.
  await renderServer({ url: "/after-action" });
  await expect.element(page.getByText("Remembered: nothing")).toBeVisible();

  await page.getByRole("button", { name: "Remember ada" }).click();

  // The page after the action reads it, as does the next request.
  await expect.element(page.getByText("Remembered: ada")).toBeVisible();
  expect(document.cookie).toContain("remembered=ada");
});

test("still reads the request after a yield and in a for await, which are left as they are", async () => {
  // On Node.js every read after a `yield` and in a `for await` has the
  // request store. Here such a function is not compiled, so it does not
  // break, and reads the store of the request it runs in, which in a route
  // is the same one. In a cached function it would not be: see "The Scope Of
  // A Cached Function" in docs/next-routes.md.
  const response = await handleRequest("/api/for-await", { headers: { cookie: "who=ada" } });

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(["1:ada:ada", "2:ada:ada"]);
});
