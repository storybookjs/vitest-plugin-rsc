import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";

test("renderServer resolves a parallel route default slot in notes demo", async () => {
  const { container } = await renderServer({ url: "/route-patterns/defaulted" });

  expect(container).toBe(document.body);
  expect(document.documentElement.lang).toBe("en");
  expect(document.documentElement.className).toContain("__next_font_variable_");
  expect(
    getComputedStyle(document.documentElement).getPropertyValue("--font-geist-sans"),
  ).toContain("Geist");
  expect(
    getComputedStyle(document.documentElement).getPropertyValue("--font-geist-mono"),
  ).toContain("Geist Mono");
  expect(document.body.querySelector("html")).toBeNull();
  expect(document.body.querySelector("body")).toBeNull();
  await expect.element(page.getByTestId("notes-route-patterns-layout")).toBeVisible();
  await expect.element(page.getByTestId("notes-defaulted-children")).toBeVisible();
  await expect
    .element(page.getByRole("heading", { name: "Notes defaulted children" }))
    .toBeVisible();
  await expect.element(page.getByTestId("notes-defaulted-slot")).toBeVisible();
  await expect.element(page.getByText("Notes default slot content")).toBeVisible();
});
