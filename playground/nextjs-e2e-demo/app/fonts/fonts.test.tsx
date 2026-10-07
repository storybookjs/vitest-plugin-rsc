import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { afterEach, beforeEach, expect, test, vi, type MockInstance } from "vitest";
import { page } from "vitest/browser";
import { GeistMono } from "geist/font/mono";
import { geist, inter } from "./fonts.ts";

// next/font: Next's font loaders make the CSS of a font and serve its files.

let consoleError: MockInstance<typeof console.error>;

beforeEach(() => {
  vi.restoreAllMocks();
  consoleError = vi.spyOn(console, "error");
});

afterEach(() => {
  // React reports a hydration mismatch here, and Next a failed render.
  expect(consoleError.mock.calls).toEqual([]);
});

test("sets text in a font of next/font/local, a file of the app", async () => {
  await renderServer({ url: "/fonts" });

  const text = page.getByText("Set in Geist", { exact: true });
  await expect.element(text).toHaveClass(geist.className);
  await expect.element(text).toHaveStyle({ fontFamily: geist.style.fontFamily });
  // Served where Next's build puts it.
  const [face] = await document.fonts.load(`16px ${geist.style.fontFamily}`);
  expect(face?.status).toBe("loaded");
});

test("sets text in a font of next/font/google, which Next hosts itself", async () => {
  await renderServer({ url: "/fonts" });

  expect(inter.style.fontFamily).toMatch(/^'Inter', 'Inter Fallback'$/);
  const text = page.getByText("Set in Inter");
  await expect.element(text).toHaveClass(inter.className);
  await expect.element(text).toHaveStyle({ fontFamily: inter.style.fontFamily });
  // Not its fallback font, which Next sets when the download fails.
  const [face] = await document.fonts.load(`16px ${inter.style.fontFamily}`);
  expect(face?.family).toBe("Inter");
  expect(face?.status).toBe("loaded");
  const sources = [...document.querySelectorAll("style")].flatMap(
    (style) => style.textContent?.match(/url\([^)]+\)/g) ?? [],
  );
  expect(sources).not.toEqual([]);
  for (const source of sources) expect(source).toMatch(/^url\(\/_next\/static\/media\//);
});

test("sets text in the font of a package that calls next/font itself, like geist", async () => {
  await renderServer({ url: "/fonts" });

  const text = page.getByText("Set in the font of a package");
  await expect.element(text).toHaveClass(GeistMono.className);
  await expect.element(text).toHaveStyle({ fontFamily: GeistMono.style.fontFamily });
  const [face] = await document.fonts.load(`16px ${GeistMono.style.fontFamily}`);
  expect(face?.status).toBe("loaded");
});

test("defines the CSS variable of a font", async () => {
  await renderServer({ url: "/fonts" });

  await expect
    .element(page.getByText("Set in Geist through its variable"))
    .toHaveStyle({ fontFamily: geist.style.fontFamily });
});

test("gives a font the same class name on the server and in the browser", async () => {
  await renderServer({ url: "/fonts" });

  // A Client Component, which calls the font function in both layers. A
  // difference is a hydration mismatch, which React reports.
  const name = page.getByText(`Client Component in ${geist.style.fontFamily}`);
  await expect.element(name).toHaveClass(geist.className);
});

test("loads a font that only a Client Component calls", async () => {
  await renderServer({ url: "/fonts" });

  const text = page.getByText("Set in a font of a Client Component");
  const { fontFamily } = getComputedStyle(text.element());
  expect(fontFamily).toMatch(/^display, "display Fallback"$/);
  const [face] = await document.fonts.load(`16px ${fontFamily}`);
  expect(face?.status).toBe("loaded");
});
