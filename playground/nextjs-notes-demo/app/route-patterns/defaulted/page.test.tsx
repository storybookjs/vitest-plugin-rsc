import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";

test("renderServer resolves a parallel route default slot in notes demo", async () => {
  const { container } = await renderServer({ url: "/route-patterns/defaulted" });

  expect(container).toBe(document.body);
  expect(document.documentElement.lang).toBe("en");
  expect(document.documentElement.className).toContain("__variable_");
  expect(
    getComputedStyle(document.documentElement).getPropertyValue("--font-geist-sans"),
  ).toContain("Geist");
  expect(
    getComputedStyle(document.documentElement).getPropertyValue("--font-geist-mono"),
  ).toContain("Geist Mono");
  const nextFontCss = getNextFontCss();
  expect(nextFontCss).toContain("/_next/static/media/");
  expect(nextFontCss).toContain(".p.woff2");
  expect(nextFontCss).not.toContain("data:font");
  const fontUrl = /url\(([^)]+\.woff2)\)/.exec(nextFontCss)?.[1];
  expect(fontUrl).toBeDefined();
  const fontResponse = await fetch(fontUrl!);
  expect(fontResponse.ok).toBe(true);
  expect(fontResponse.headers.get("content-type")).toContain("font/woff2");
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

function getNextFontCss() {
  return Array.from(
    document.querySelectorAll<HTMLStyleElement>('style[id^="vitest-plugin-rsc-next-font"]'),
    (style) => style.textContent ?? "",
  ).join("\n");
}
