import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { afterEach, expect, test, vi } from "vitest";
import { page } from "vitest/browser";

afterEach(() => {
  vi.doUnmock("../lib/tides.ts");
});

// The server layers load while the project's setup files run, and the dev
// server may compile a module of the app before the page asks for it. A mock
// that registers after both is the latest a setup file's can: the layers
// have loaded once a test runs, and this route is this file's alone, so no
// other test file has loaded its modules.
test("a mock registered after the server layers loaded and the dev server compiled the module reaches the route", async () => {
  const compiled = await fetch("/app/lib/tides.ts");
  expect(await compiled.text()).toContain("getHighTide");
  vi.doMock("../lib/tides.ts", () => ({ getHighTide: async () => "06:12" }));

  await renderServer({ url: "/tides" });

  await expect.element(page.getByText("High tide: 06:12")).toBeVisible();
});
