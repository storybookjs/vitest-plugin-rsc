import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";

test("next/font generates browser-visible CSS for visual tests", async () => {
  await renderServer({ url: "/font" });

  await expect.element(page.getByRole("heading", { name: "Next font route" })).toBeVisible();
  await expect.element(page.getByText("font-family: Geist Mono")).toBeVisible();
  await expect.element(page.getByText("Local font rendered", { exact: true })).toBeVisible();
  await expect.element(page.getByText("Local multi font rendered")).toBeVisible();
  await expect.element(page.getByText("Exported Google font rendered")).toBeVisible();
  await expect.element(page.getByText("Exported local font rendered")).toBeVisible();

  const fontScope = document.querySelector<HTMLElement>('[data-testid="font-scope"]');
  expect(fontScope?.className).toContain("__variable_");
  expect(fontScope?.className.match(/__variable_/g)?.length).toBe(6);
  expect(document.querySelector('[data-testid="google-style-family"]')?.textContent).toContain(
    "Geist",
  );
  expect(document.querySelector('[data-testid="local-style-family"]')?.textContent).toContain(
    "exportedLocalFont",
  );
  expect(document.querySelector('[data-testid="local-multi-style-family"]')?.textContent).toContain(
    "localMulti",
  );

  const fontCss = Array.from(document.head.querySelectorAll("style"))
    .map((style) => style.textContent ?? "")
    .join("\n");
  expect(fontCss).toContain("@font-face");
  expect(fontCss).toContain("/_next/static/media/");
  expect(fontCss).toContain(".woff2");
  expect(fontCss).not.toContain("data:font/woff2");
  expect(fontCss).toContain("font-display: swap");
  expect(fontCss).toContain("--font-geist-sans:");
  expect(fontCss).toContain("--font-geist-mono:");
  expect(fontCss).toContain("--font-local-geist: 'localGeist");
  expect(fontCss).toContain("--font-local-multi: 'localMulti");
  expect(fontCss).toContain('font-feature-settings: "kern";');
  expect(fontCss).toContain("font-weight: 400;");
  expect(fontCss).toContain("font-style: italic;");
  expect(fontCss).toContain("--font-exported-google:");
  expect(fontCss).toContain("size-adjust:");
  expect(fontCss).toContain("ascent-override:");
  expect(fontCss).toContain("--font-exported-local: 'exportedLocalFont");

  const staticFontUrl = /url\((["']?)(\/_next\/static\/media\/[^)"']+\.woff2)\1\)/.exec(
    fontCss,
  )?.[2];
  expect(staticFontUrl).toBeTruthy();
  const staticFontResponse = await fetch(staticFontUrl!);
  expect(staticFontResponse.ok).toBe(true);
  expect(staticFontResponse.headers.get("content-type")).toContain("font/woff2");

  const preloadedFonts = Array.from(
    document.head.querySelectorAll<HTMLLinkElement>('link[rel="preload"][as="font"]'),
    (link) => link.getAttribute("href") ?? "",
  );
  expect(preloadedFonts.some((href) => /\/_next\/static\/media\/.+\.p\.woff2/.test(href))).toBe(
    true,
  );
});
