// @vitest-environment jsdom
import { expect, test, vi } from "vitest";
// What the Node host gives jsdom of a browser's DOM.
import "../node-dom.ts";

vi.mock("virtual:vitest-plugin-rsc/page-host", () => ({ default: { loadsStylesheets: false } }));
const { unloadDocument, loadDocument } = await import("./document.ts");

// A page load in jsdom, whose selectors build an engine of selectors for each
// document they query, which adds listeners to the window that stay.

const html = `<!doctype html><html><head>
<link rel="preload" as="script" href="/app.js"><script src="/app.js"></script>
<link rel="Stylesheet" href="/page.css"></head><body>
<meta id="__next-page-redirect" http-equiv="refresh" content="1;url=/next"><h1>Page</h1>
</body></html>`;

test("a page load adds no listener to the window, and does what it did with selectors", async () => {
  // The document's own engine, once.
  document.querySelectorAll("script");
  const { window: jsdomWindow } = (globalThis as unknown as { jsdom: { window: Window } }).jsdom;
  const added = vi.spyOn(jsdomWindow, "addEventListener");

  for (let load = 0; load < 3; load++) await loadDocument(html, `${location.origin}/page`);

  expect(added).not.toHaveBeenCalled();
  expect(document.querySelector("h1")?.textContent).toBe("Page");
  expect(document.getElementById("__next-page-redirect")?.hasAttribute("http-equiv")).toBe(false);
  // React has the browser preload the script that starts the app.
  expect(document.querySelector('link[rel="preload"]')).toBeNull();
  expect(document.querySelector('link[rel="Stylesheet"]')).not.toBeNull();
  unloadDocument();
});
