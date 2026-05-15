import { expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";

test("renderServer resolves page metadata through Next route conventions", async () => {
  await renderServer({ url: "/route-patterns/conventions" });

  await expect.element(page.getByRole("heading", { name: "Route conventions" })).toBeVisible();
  expect(document.title).toBe("Route convention metadata");
});

test("renderServer resolves route-level not-found conventions through Next", async () => {
  await renderServer({ url: "/route-patterns/conventions?mode=not-found" });

  await expect.element(page.getByRole("heading", { name: "Convention not found" })).toBeVisible();
});

test("renderServer resolves route-level forbidden conventions through Next", async () => {
  await ignoreExpectedAccessFallbackErrors(() =>
    renderServer({ url: "/route-patterns/conventions?mode=forbidden" }),
  );

  await expect.element(page.getByRole("heading", { name: "Convention forbidden" })).toBeVisible();
});

test("renderServer resolves route-level unauthorized conventions through Next", async () => {
  await ignoreExpectedAccessFallbackErrors(() =>
    renderServer({ url: "/route-patterns/conventions?mode=unauthorized" }),
  );

  await expect
    .element(page.getByRole("heading", { name: "Convention unauthorized" }))
    .toBeVisible();
});

test("renderServer resolves route-level error conventions through Next", async () => {
  await ignoreExpectedConsoleErrors(
    ["segment convention failure", "<html> cannot be a child"],
    async () => {
      await renderServer({ url: "/route-patterns/conventions?mode=error" });

      await expect
        .element(page.getByRole("heading", { name: "Convention error boundary" }))
        .toBeVisible();
      await expect.element(page.getByText("segment convention failure")).toBeVisible();
    },
  );
});

test("renderServer resolves global-error conventions through Next", async () => {
  await ignoreExpectedConsoleErrors(
    ["global convention failure", "<html> cannot be a child"],
    async () => {
      await renderServer({ url: "/route-patterns/global-error" });

      await expect
        .element(page.getByRole("heading", { name: "Global route error boundary" }))
        .toBeVisible();
      await expect.element(page.getByText("global convention failure")).toBeVisible();
    },
  );
});

async function ignoreExpectedAccessFallbackErrors<T>(callback: () => Promise<T>) {
  return ignoreExpectedConsoleErrors(["NEXT_HTTP_ERROR_FALLBACK"], callback);
}

async function ignoreExpectedConsoleErrors<T>(messages: string[], callback: () => Promise<T>) {
  const originalError = console.error;
  const originalLog = console.log;
  const isExpected = (args: unknown[]) =>
    args.some((arg) => messages.some((message) => String(arg).includes(message)));
  const spy = vi.spyOn(console, "error").mockImplementation((...args) => {
    if (isExpected(args)) return;
    originalError(...args);
  });
  const logSpy = vi.spyOn(console, "log").mockImplementation((...args) => {
    if (isExpected(args)) return;
    originalLog(...args);
  });

  try {
    return await callback();
  } finally {
    spy.mockRestore();
    logSpy.mockRestore();
  }
}
