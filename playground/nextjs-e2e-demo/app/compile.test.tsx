import { handleRequest, renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import {
  afterAll,
  afterEach,
  beforeEach,
  expect,
  onTestFinished,
  test,
  vi,
  type MockInstance,
} from "vitest";
import { page } from "vitest/browser";
import { cssRules } from "../test/browser.ts";
import { fileChanged, releaseStylesheet } from "../test/service.ts";

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

// The link of a stylesheet that the page is loading.
const lateStylesheet = (key: string) =>
  document.querySelector(`link[href="/service/late-stylesheet?key=${key}"]`);

test("shows a page once the stylesheets of its head have loaded, and what was there until then", async () => {
  const key = crypto.randomUUID();
  const { body, title } = document;
  // The color of the text as it comes into the document.
  const colors: string[] = [];
  const observer = new MutationObserver(() => {
    const text = document.querySelector(".late");
    if (text && colors.length === 0) colors.push(getComputedStyle(text).color);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  onTestFinished(() => observer.disconnect());

  const loading = renderServer({ url: `/late-css?key=${key}` });
  // The head of the page is in the document, where its stylesheet loads.
  await expect.poll(() => lateStylesheet(key)).not.toBeNull();
  expect(document.body).toBe(body);
  expect(document.title).toBe(title);
  expect(document.querySelector(".late")).toBeNull();

  await releaseStylesheet(key);
  await loading;

  expect(colors).toEqual(["rgb(0, 0, 255)"]);
});

test("leaves a page whose stylesheet is still loading, which does not show after it", async () => {
  const key = crypto.randomUUID();
  const left = renderServer({ url: `/late-css?key=${key}` }).catch((error: unknown) => error);
  await expect.poll(() => lateStylesheet(key)).not.toBeNull();

  await renderServer({ url: "/notice" });
  expect(await left).toMatchObject({ name: "AbortError" });
  await releaseStylesheet(key);

  await expect.element(page.getByText("The office is closed on Friday.")).toBeVisible();
  expect(lateStylesheet(key)).toBeNull();
  expect(document.querySelector(".late")).toBeNull();
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

// The stylesheets of the page that the tab gets from the server while `load`
// runs. One that the browser has from its cache moves no bytes. An observer,
// as the tab is shared with other test files, which read the entries of before.
async function stylesheetsFetched(load: () => Promise<unknown>): Promise<string[]> {
  const entries: PerformanceEntry[] = [];
  const observer = new PerformanceObserver((list) => entries.push(...list.getEntries()));
  observer.observe({ type: "resource" });
  await load();
  entries.push(...observer.takeRecords());
  observer.disconnect();
  const linked = new Set(
    Array.from(
      document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'),
      (link) => link.href,
    ),
  );
  return entries
    .filter(({ name }) => linked.has(name))
    .filter((entry) => (entry as PerformanceResourceTiming).transferSize > 0)
    .map(({ name }) => name.split("/").pop()!);
}

test("does not fetch the stylesheets of a page again for the next page load", async () => {
  await renderServer({ url: "/styles" });

  expect(await stylesheetsFetched(() => renderServer({ url: "/styles" }))).toEqual([]);

  expect(getComputedStyle(document.body).backgroundColor).toBe("rgb(240, 240, 255)");
  await expect
    .element(page.getByText("Styled by a CSS module in a Client Component"))
    .toHaveStyle({ color: "rgb(128, 0, 0)" });
});

test("takes the CSS of a page that the browser keeps away with the page", async () => {
  await renderServer({ url: "/styles" });
  await renderServer({ url: "/notice" });
  await renderServer({ url: "/styles" });

  expect(await stylesheetsFetched(() => renderServer({ url: "/notice" }))).toEqual([]);

  await expect
    .element(page.getByText("The office is closed on Friday."))
    .toHaveStyle({ color: "rgb(0, 128, 0)" });
  expect(getComputedStyle(document.body).backgroundColor).toBe("rgba(0, 0, 0, 0)");
});

const editTo = (color: string) =>
  fileChanged("app/edited-css/page.css", `.edited { color: ${color}; }`);
// What is in the file again, for the dev server.
afterAll(() => fileChanged("app/edited-css/page.css"));
const edited = () => page.getByText("Styled by a stylesheet that is edited");
const stylesheet = () => document.querySelector<HTMLLinkElement>('link[href*="/edited-css/"]')!;

test("links the CSS of a stylesheet after an edit, and not the one the browser has", async () => {
  await editTo("rgb(0, 0, 255)");
  await renderServer({ url: "/edited-css" });
  await expect.element(edited()).toHaveStyle({ color: "rgb(0, 0, 255)" });

  await editTo("rgb(255, 0, 0)");
  await renderServer({ url: "/edited-css" });
  await expect.element(edited()).toHaveStyle({ color: "rgb(255, 0, 0)" });

  // Back to what the browser has had before.
  await editTo("rgb(0, 0, 255)");
  await renderServer({ url: "/edited-css" });
  await expect.element(edited()).toHaveStyle({ color: "rgb(0, 0, 255)" });
});

test("serves a stylesheet for the browser to keep, and one of before an edit for it not to", async () => {
  await editTo("rgb(0, 128, 255)");
  await renderServer({ url: "/edited-css" });
  const { href } = stylesheet();
  const current = await fetch(href, { cache: "no-store" });
  expect(current.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");

  await editTo("rgb(255, 128, 0)");
  const old = await fetch(href, { cache: "no-store" });

  expect(await old.text()).toContain("rgb(255, 128, 0)");
  expect(old.headers.get("cache-control")).toBe("no-cache");
});

test("links a stylesheet that fails to compile without a version, and with one once it compiles", async () => {
  // The tab loads the modules of the page once, with CSS that compiles: what
  // fails then is the stylesheet that Next links.
  await editTo("rgb(0, 0, 0)");
  await renderServer({ url: "/edited-css" });

  await fileChanged("app/edited-css/page.css", ".edited {");
  await renderServer({ url: "/edited-css" });
  const { href } = stylesheet();
  expect(new URL(href).pathname).toBe("/_next/static/css/app/edited-css/page.css");
  expect((await fetch(href, { cache: "no-store" })).status).toBe(500);

  await editTo("rgb(0, 0, 255)");
  await renderServer({ url: "/edited-css" });

  expect(stylesheet().href).toMatch(
    /\/_next\/static\/css\/[0-9a-f]{16}\/app\/edited-css\/page\.css$/,
  );
  await expect.element(edited()).toHaveStyle({ color: "rgb(0, 0, 255)" });
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
