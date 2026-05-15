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

async function ignoreExpectedAccessFallbackErrors<T>(callback: () => Promise<T>) {
  const originalError = console.error;
  const spy = vi.spyOn(console, "error").mockImplementation((...args) => {
    if (args.some((arg) => String(arg).includes("NEXT_HTTP_ERROR_FALLBACK"))) return;
    originalError(...args);
  });

  try {
    return await callback();
  } finally {
    spy.mockRestore();
  }
}
