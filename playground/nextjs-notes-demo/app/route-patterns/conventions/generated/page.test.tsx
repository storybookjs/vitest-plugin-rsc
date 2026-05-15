import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";

test("renderServer resolves generated metadata and segment config exports", async () => {
  await renderServer({ url: "/route-patterns/conventions/generated" });

  await expect
    .element(page.getByRole("heading", { name: "Generated route conventions" }))
    .toBeVisible();
  expect(document.title).toBe("Generated route convention metadata");
  expect(document.querySelector('meta[name="description"]')?.getAttribute("content")).toBe(
    "Generated through Next route metadata conventions.",
  );
  expect(document.querySelector('meta[name="theme-color"]')?.getAttribute("content")).toBe(
    "#123456",
  );
  expect(document.querySelector('meta[name="color-scheme"]')?.getAttribute("content")).toBe(
    "dark",
  );
});
