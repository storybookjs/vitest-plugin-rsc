import { handleRequest, renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { afterEach, beforeEach, expect, test, vi, type MockInstance } from "vitest";
import { page } from "vitest/browser";
import { cssRules } from "../test/browser.ts";

// What Next's compiler does to the code of the app, and what the app gets from
// Vite instead: next/dynamic, styled-jsx, next/script, CSS, and the checks of
// what a layer may import.

let consoleError: MockInstance<typeof console.error>;

beforeEach(() => {
  vi.restoreAllMocks();
  consoleError = vi.spyOn(console, "error");
});

afterEach(() => {
  // React reports a hydration mismatch here, and Next a failed render.
  expect(consoleError.mock.calls).toEqual([]);
});

const logged = () => consoleError.mock.calls.flat().map(String).join("\n");

test("loads a component with next/dynamic on the server, and one with ssr: false in the browser only", async () => {
  const html = await (await handleRequest("/lazy")).text();
  expect(html).toContain("Summary: rendered on the server");
  expect(html).toContain("Legend: <!-- -->closed");
  expect(html).toContain("Loading chart…");
  expect(html).not.toContain("Chart: drawn");

  await renderServer({ url: "/lazy" });

  await expect.element(page.getByText("Chart: drawn in a browser")).toBeVisible();
  await page.getByRole("button", { name: "Legend: closed" }).click();
  await expect.element(page.getByRole("button", { name: "Legend: open" })).toBeVisible();
});

test("runs the scripts of next/script, a beforeInteractive one first", async () => {
  await renderServer({ url: "/script" });

  await expect
    .poll(() => document.documentElement.dataset.scripts)
    .toBe("beforeInteractive afterInteractive");
});

test("applies global CSS and CSS modules, in Server and Client Components", async () => {
  await renderServer({ url: "/styles" });

  await expect
    .element(page.getByText("Styled by a global stylesheet"))
    .toHaveStyle({ color: "rgb(0, 0, 255)" });
  await expect
    .element(page.getByText("Styled by a CSS module in a Server Component"))
    .toHaveStyle({ color: "rgb(0, 128, 0)" });
  await expect
    .element(page.getByText("Styled by a CSS module in a Client Component"))
    .toHaveStyle({ color: "rgb(128, 0, 0)" });
});

test("gives a page the CSS of the app, and not that of the test runner's page", async () => {
  // Vitest's own page for the tests has `body { margin: 0 }`; the plugin's has
  // nothing. Neither the app nor `/notice` sets a margin, so the body has the
  // browser's, as with `next start`.
  await renderServer({ url: "/notice" });
  await expect.element(page.getByText("The office is closed on Friday.")).toBeVisible();

  expect(getComputedStyle(document.body).margin).toBe("8px");
});

test("does not wait for a stylesheet of another origin, or for an alternate one", async () => {
  // Both are a server that never answers.
  await renderServer({ url: "/elsewhere-css" });

  await expect.element(page.getByText("Loaded without them")).toBeVisible();
});

test("gives a class of a CSS module the name Next gives it", async () => {
  await renderServer({ url: "/styles" });

  // `[file]_[class]__[hash]`, of `getCssModuleLocalIdent()` in Next's build.
  // Not imported here: the CSS of a module that a test file imports is a
  // `<style>` of Vite's, which would style the page as well.
  const card = page.getByText("Styled by a CSS module in a Server Component").element();
  expect(card.className).toMatch(/^card_card__[\w-]{5}$/);
});

test("takes the global CSS of a page away with the page, and brings it back with it", async () => {
  const background = () => getComputedStyle(document.body).backgroundColor;

  await renderServer({ url: "/styles" });
  expect(background()).toBe("rgb(240, 240, 255)");

  await renderServer({ url: "/notice" });
  await expect.element(page.getByText("The office is closed on Friday.")).toBeVisible();
  expect(background()).toBe("rgba(0, 0, 0, 0)");

  await renderServer({ url: "/styles" });
  expect(background()).toBe("rgb(240, 240, 255)");
});

test("links the CSS of a package, and of a component of a package, with the page", async () => {
  const hasRule = (selector: string) =>
    cssRules().some((rule) => rule instanceof CSSStyleRule && rule.selectorText === selector);

  await renderServer({ url: "/styles" });
  await expect
    .element(page.getByText("Styled by the stylesheet of a package"))
    .toHaveStyle({ color: "rgb(0, 128, 128)" });
  await expect
    .element(page.getByText("Styled by the CSS of a component of a package"))
    .toHaveStyle({ color: "rgb(128, 128, 0)" });
  await expect
    .element(page.getByText("Styled by the CSS of a Client Component of a package"))
    .toHaveStyle({ color: "rgb(0, 0, 128)" });

  await renderServer({ url: "/notice" });
  await expect.element(page.getByText("The office is closed on Friday.")).toBeVisible();
  expect(hasRule(".package-reset")).toBe(false);
  expect(hasRule(".package-badge")).toBe(false);
  expect(hasRule(".package-client-badge")).toBe(false);
});

test("scopes the styles of styled-jsx to their component", async () => {
  await renderServer({ url: "/styled-jsx" });

  await expect
    .element(page.getByText("Styled by styled-jsx"))
    .toHaveStyle({ color: "rgb(128, 0, 128)" });
  await expect
    .element(page.getByText("Not in the component"))
    .not.toHaveStyle({ color: "rgb(128, 0, 128)" });
});

test("lets a Server Component import server-only code, by a path of the tsconfig", async () => {
  await renderServer({ url: "/secret" });

  await expect.element(page.getByText("API key: key-123")).toBeVisible();
});

test("fails a Server Component that imports client-only code, with the error of `next build`", async () => {
  consoleError.mockImplementation(() => {});

  await expect(renderServer({ url: "/wrong-layer/client-only" })).rejects.toThrow(
    "You're importing a component that imports client-only. It only works in a Client Component",
  );
  consoleError.mockClear();
});

test("fails a Server Component that calls a client hook, with the error of `next build`", async () => {
  consoleError.mockImplementation(() => {});

  await expect(renderServer({ url: "/wrong-layer/client-hook" })).rejects.toThrow(
    "You're importing a module that depends on `useState` into a React Server Component module.",
  );
  consoleError.mockClear();
});

test("fails a Client Component that imports server-only code, with the error of `next build`", async () => {
  const message = `You're importing a module that depends on "server-only" into a React Client Component module.`;
  consoleError.mockImplementation(() => {});
  // An uncaught error in the browser, which fails a test run.
  const reportError = vi.spyOn(window, "reportError").mockImplementation(() => {});

  await renderServer({ url: "/wrong-layer/server-only" });

  // The server could not render the component, and neither can the browser.
  await expect.element(page.getByText("This page couldn’t load")).toBeVisible();
  expect(logged()).toContain(message);
  expect(String(reportError.mock.calls)).toContain(message);
  consoleError.mockClear();
});

test("compiles JSX in a .js file, as Next does", async () => {
  await renderServer({ url: "/plain-js" });

  await expect.element(page.getByText("Rendered from a .js file")).toBeVisible();
  await page.getByRole("button", { name: "Plain toggle: off" }).click();
  await expect.element(page.getByRole("button", { name: "Plain toggle: on" })).toBeVisible();
});
