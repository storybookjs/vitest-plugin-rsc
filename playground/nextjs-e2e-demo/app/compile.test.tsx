import { handleRequest, renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { afterEach, beforeEach, expect, test, vi, type MockInstance } from "vitest";
import { page } from "vitest/browser";

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

test("scopes the styles of styled-jsx to their component", async () => {
  await renderServer({ url: "/styled-jsx" });

  await expect
    .element(page.getByText("Styled by styled-jsx"))
    .toHaveStyle({ color: "rgb(128, 0, 128)" });
  await expect
    .element(page.getByText("Not in the component"))
    .not.toHaveStyle({ color: "rgb(128, 0, 128)" });
});

test("lets a Server Component import server-only code", async () => {
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
