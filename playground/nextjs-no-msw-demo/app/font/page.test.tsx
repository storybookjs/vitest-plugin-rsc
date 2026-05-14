import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";

test("next/font generates browser-visible CSS for visual tests", async () => {
  await renderServer({ url: "/font" });

  await expect.element(page.getByRole("heading", { name: "Next font route" })).toBeVisible();
  await expect.element(page.getByText("font-family: Geist Mono")).toBeVisible();

  const fontScope = document.querySelector<HTMLElement>('[data-testid="font-scope"]');
  expect(fontScope?.className).toContain("__next_font_variable_");
  expect(getComputedStyle(fontScope!).getPropertyValue("--font-geist-sans")).toContain("Geist");
  expect(getComputedStyle(fontScope!).getPropertyValue("--font-geist-mono")).toContain(
    "Geist Mono",
  );

  const fontCss = Array.from(document.head.querySelectorAll("style"))
    .map((style) => style.textContent ?? "")
    .join("\n");
  expect(fontCss).toContain("@font-face");
  expect(fontCss).toContain("data:font/woff2");
});
