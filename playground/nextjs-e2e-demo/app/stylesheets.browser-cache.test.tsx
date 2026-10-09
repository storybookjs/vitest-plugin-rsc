import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { afterAll, expect, test } from "vitest";
import { page } from "vitest/browser";
import { fileChanged } from "../test/service.ts";

// What the browser keeps of the stylesheets that Next links. A project of its
// own, without the setup file, which mocks a module: see vitest.config.ts.

const background = () => getComputedStyle(document.body).backgroundColor;

// The stylesheets of the page that the tab gets from the server while `load`
// runs. One that the browser has from its cache moves no bytes.
async function stylesheetsFetched(load: () => Promise<unknown>): Promise<string[]> {
  performance.clearResourceTimings();
  await load();
  const linked = new Set(
    Array.from(
      document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'),
      (link) => link.href,
    ),
  );
  return performance
    .getEntriesByType("resource")
    .filter(({ name }) => linked.has(name))
    .filter((entry) => (entry as PerformanceResourceTiming).transferSize > 0)
    .map(({ name }) => name.split("/").pop()!);
}

test("does not fetch the stylesheets of a page again for the next page load", async () => {
  await renderServer({ url: "/styles" });

  expect(await stylesheetsFetched(() => renderServer({ url: "/styles" }))).toEqual([]);

  expect(background()).toBe("rgb(240, 240, 255)");
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
  expect(background()).toBe("rgba(0, 0, 0, 0)");
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

test("links a stylesheet that fails to compile by a version of its own, and by its CSS once it compiles", async () => {
  await fileChanged("app/edited-css/page.css", ".edited {");
  await renderServer({ url: "/edited-css" });
  const { href } = stylesheet();
  expect((await fetch(href, { cache: "no-store" })).status).toBe(500);

  await editTo("rgb(0, 0, 255)");
  await renderServer({ url: "/edited-css" });

  expect(stylesheet().href).not.toBe(href);
  expect(stylesheet().href).toMatch(
    /\/_next\/static\/css\/[0-9a-f]{16}\/app\/edited-css\/page\.css$/,
  );
  await expect.element(edited()).toHaveStyle({ color: "rgb(0, 0, 255)" });
});
