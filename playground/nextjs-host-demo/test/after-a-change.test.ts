import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { stripVTControlCharacters } from "node:util";
import type { Page } from "playwright";
import { afterAll, expect } from "vitest";
import { copyProject } from "../../test-helpers/build.ts";
import { createProject, test, type DevServer } from "../../test-helpers/host.ts";
import type { HostWindow } from "../host/state.ts";
import { style } from "./host-page.ts";

// A change of a file of the app while the host has a page of the app open,
// on Vite's dev server without Vitest. Each test serves a copy of the project
// of its own, which it changes: the dev servers of the other tests do not see
// the change, and the module graph has only what this test's host loaded.

const root = fileURLToPath(new URL("../", import.meta.url));
const copies: string[] = [];
const sites: DevServer[] = [];

afterAll(async () => {
  await Promise.all(sites.map((site) => site.close()));
  for (const copy of copies) fs.rmSync(copy, { recursive: true, force: true });
});

// A dev server of a copy of the project, which `edit` changes before the
// server starts.
async function serveCopy(edit: (copy: string) => void = () => {}) {
  const copy = fs.mkdtempSync(path.join(root, "..", ".nextjs-host-demo-"));
  copies.push(copy);
  copyProject(root, copy);
  edit(copy);
  const site = await createProject(copy).serve((port) => [
    "vite",
    "--configLoader",
    "native",
    "--port",
    String(port),
    "--strictPort",
  ]);
  sites.push(site);
  return {
    copy,
    url: `${site.url}?view=page`,
    output: () => stripVTControlCharacters(site.output()),
  };
}

const hostState = () => (window as HostWindow).__hostState;
const hostError = () => String((window as HostWindow).__hostError);

// The page of the app at `/`, which shows the greeting, in the host's
// document at `url`, once it has loaded.
async function openPage(page: Page, url: string) {
  await page.goto(url);
  await page.waitForFunction(hostState);
  expect(await page.evaluate(hostState), await page.evaluate(hostError)).toBe("ready");
  await page.evaluate(() => Object.assign(window, { __beforeTheChange: true }));
}

// Changes the greeting of the app in `copy`, and resolves once the host's
// document has loaded again at the host's `url`, not the page's, with the page
// as the app is now.
async function changeGreeting(page: Page, copy: string, url: string, greetingWord: string) {
  const greeting = path.join(copy, "app/components/greeting.tsx");
  const source = fs.readFileSync(greeting, "utf8");
  fs.writeFileSync(greeting, source.replace(/<h2>\w+ from/, `<h2>${greetingWord} from`));
  await loadedAgain(page, url);
  await page.getByRole("heading", { name: `${greetingWord} from the page` }).waitFor();
}

// Resolves once the host's document has loaded again at the host's `url`,
// not the page's, and has opened the page again.
async function loadedAgain(page: Page, url: string) {
  await page.waitForFunction(
    () => !("__beforeTheChange" in window) && (window as HostWindow).__hostState,
  );
  expect(await page.evaluate(hostState), await page.evaluate(hostError)).toBe("ready");
  // The URL that the document loaded with: the open page shows the app's.
  const loadedWith = await page.evaluate(
    () => (performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming).name,
  );
  expect(loadedWith).toBe(url);
}

// A copy has no pre-bundled dependencies. Each layer pre-bundles what the
// host's pages and the app import once, before the first page: what Vite
// finds only after that, it bundles again, and loads the page again for.
test("a dev server pre-bundles once, before the first page", async ({ page }) => {
  const { url, output } = await serveCopy();
  await openPage(page, url);
  expect(output()).not.toMatch(/new dependencies optimized|optimized dependencies changed/);
});

test("a change of a file of the app loads the host's document again", async ({ page }) => {
  const { copy, url } = await serveCopy();
  await openPage(page, url);
  await changeGreeting(page, copy, url, "Hi");
});

test("also for a host that takes a change of its own modules in place", async ({ page }) => {
  // As a framework does that renders its modules again after a change: the
  // runtime of the plugin is one of them. Before the server starts, so that
  // the browser loads the host as it is.
  const { copy, url } = await serveCopy((copy) =>
    fs.appendFileSync(path.join(copy, "host/main.tsx"), "\nimport.meta.hot?.accept();\n"),
  );
  await openPage(page, url);
  await changeGreeting(page, copy, url, "Hey");
});

// Vite's client loads the document again once a dev server that went away
// answers again, as after a restart, without `vite:beforeFullReload`.
test("a restart of the dev server loads the host's document again", async ({ page }) => {
  const { copy, url } = await serveCopy();
  await openPage(page, url);
  // Vite restarts its server after a change of the config file.
  const now = new Date();
  fs.utimesSync(path.join(copy, "vite.config.ts"), now, now);
  await loadedAgain(page, url);
  await page.getByRole("heading", { name: "Hello from the page" }).waitFor();
});

test("a change of another page of the host keeps the page that is open", async ({ page }) => {
  // Vite's client loads the document again for a change of an HTML file only
  // if it is this document's, which is `index.html` here.
  const { copy, url } = await serveCopy();
  const frames: string[] = [];
  page.on("websocket", (socket) =>
    socket.on("framereceived", ({ payload }) => frames.push(String(payload))),
  );
  await openPage(page, url);
  const callout = path.join(copy, "callout.html");
  fs.writeFileSync(callout, fs.readFileSync(callout, "utf8").replace("</body>", "<p></p></body>"));
  await expect
    .poll(() => frames.some((frame) => frame.includes("full-reload") && frame.includes("callout")))
    .toBe(true);
  // What would leave the page runs as the message arrives; a second is long.
  await page.waitForTimeout(1_000);
  expect(await page.evaluate(() => "__beforeTheChange" in window)).toBe(true);
  expect(await page.getByRole("heading", { name: "Hello from the page" }).count()).toBe(1);
});

// What host/in-place-badge.tsx reported: once for every time it ran.
const moduleReports = () =>
  ((window as HostWindow).__hostReports ?? []).filter(
    (entry) => (entry as { from: string }).from === "host/in-place-badge.tsx",
  );
// And host/in-place-note.tsx, which it imports.
const noteReports = () =>
  ((window as HostWindow).__hostReports ?? []).filter(
    (entry) => (entry as { from: string }).from === "host/in-place-note.tsx",
  );
const oneNote = () => (window as HostWindow).__hostOneNote;
// Until the host renders again.
const forgetOneNote = () => delete (window as HostWindow).__hostOneNote;

test('a change of what a file with "use client" imports renders it again in place', async ({
  page,
}) => {
  const { copy, url } = await serveCopy();
  await openPage(page, url.replace("view=page", "view=in-place"));
  await page.getByRole("button", { name: "Clicks: 0" }).waitFor();
  // A component that only the file of the host imports, which no route has.
  const badge = path.join(copy, "app/components/badge.tsx");
  fs.writeFileSync(badge, fs.readFileSync(badge, "utf8").replace("Clicks:", "Taps:"));
  await page.getByRole("button", { name: "Taps: 0" }).waitFor({ timeout: 30_000 });
  // The host imported the file once more before it rendered, in the same document.
  expect(await page.evaluate(moduleReports)).toHaveLength(2);
  // A change of the file itself: once more, not twice.
  const file = path.join(copy, "host/in-place-badge.tsx");
  fs.writeFileSync(
    file,
    fs.readFileSync(file, "utf8").replace("react: version", "react: version, changed: true"),
  );
  await expect
    .poll(async () => (await page.evaluate(moduleReports)).at(-1), { timeout: 30_000 })
    .toMatchObject({ changed: true });
  expect(await page.evaluate(moduleReports)).toHaveLength(3);
  await page.getByRole("button", { name: "Taps: 0" }).waitFor();
  // Each render a use of the file's stylesheets, which ends once the next
  // one's have loaded: its CSS module stays, linked once.
  expect(await style(page, "#host-root button", "color")).toBe("rgb(0, 128, 0)");
  expect(await page.locator("link[rel=stylesheet][href*='badge.module']").count()).toBe(1);
  expect(await page.evaluate(() => "__beforeTheChange" in window)).toBe(true);
});

// What Tailwind's PostCSS plugin does with a file it scans for class names:
// the file is a dependency of the stylesheet, which has the CSS of what it
// finds there. In Vite's module graph the stylesheet imports the file, and
// the root layout of the app imports the stylesheet.
const tonePlugin = `const fs = require("node:fs");
const path = require("node:path");

module.exports = () => ({
  postcssPlugin: "tone",
  Once(root, { result }) {
    if (!root.source.input.file.includes("/app/globals.css")) return;
    const file = path.join(__dirname, "host/tone.tsx");
    const [, tone] = /tone = "(.+)"/.exec(fs.readFileSync(file, "utf8"));
    root.append(\`h1 { color: \${tone}; }\`);
    result.messages.push({ type: "dependency", plugin: "tone", file });
  },
});
module.exports.postcss = true;
`;

// A copy whose app's stylesheet depends on `host/tone.tsx`, with a host
// that imports that stylesheet itself, as a framework's preview does, and
// takes a change of its own modules in place. It keeps the `renderServer`
// of each evaluation of its module.
function serveToneCopy() {
  return serveCopy((copy) => {
    // Next's shape of a config of PostCSS: plugins by the name it requires.
    fs.writeFileSync(
      path.join(copy, "postcss.config.mjs"),
      'export default { plugins: { "./postcss-tone.cjs": {} } };\n',
    );
    fs.writeFileSync(path.join(copy, "postcss-tone.cjs"), tonePlugin);
    fs.writeFileSync(path.join(copy, "host/tone.tsx"), 'export const tone = "rgb(255, 0, 0)";\n');
    const main = path.join(copy, "host/main.tsx");
    fs.writeFileSync(
      main,
      `import "../app/globals.css";\n${fs.readFileSync(main, "utf8")}\n` +
        "Object.assign(window, { __renderServers: [...((window as { __renderServers?: unknown[] }).__renderServers ?? []), renderServer] });\n" +
        "import.meta.hot?.accept();\n",
    );
  });
}

// The CSS of the stylesheet that the host imports itself: Vite's `<style>`.
const hostStylesheet = (page: Page) =>
  page.evaluate(
    () => document.querySelector('style[data-vite-dev-id$="/app/globals.css"]')?.textContent,
  );

test("a change of a file that a stylesheet of the app depends on updates the stylesheet in place", async ({
  page,
}) => {
  const { copy, url } = await serveToneCopy();
  await openPage(page, url);
  expect(await hostStylesheet(page)).toContain("h1 { color: rgb(255, 0, 0)");
  fs.writeFileSync(path.join(copy, "host/tone.tsx"), 'export const tone = "rgb(0, 128, 0)";\n');
  await expect
    .poll(() => hostStylesheet(page), { timeout: 30_000 })
    .toContain("h1 { color: rgb(0, 128, 0)");
  expect(await page.evaluate(() => "__beforeTheChange" in window)).toBe(true);
  // The host evaluates its module again after a change of it, with the
  // plugin's runtime that it had: the change of the stylesheet, which a
  // route imports, left the runtime's modules as they were.
  await page.evaluate(() => delete (window as HostWindow).__hostState);
  fs.appendFileSync(path.join(copy, "host/main.tsx"), "\n// changed\n");
  await page.waitForFunction(hostState, undefined, { timeout: 30_000 });
  expect(await page.evaluate(hostState), await page.evaluate(hostError)).toBe("ready");
  const renderServers = () =>
    page.evaluate(() => {
      const [first, ...rest] = (window as { __renderServers?: unknown[] }).__renderServers ?? [];
      return { evaluations: rest.length + 1, same: rest.every((again) => again === first) };
    });
  expect(await renderServers()).toEqual({ evaluations: 2, same: true });
  expect(await page.evaluate(() => "__beforeTheChange" in window)).toBe(true);
});

// A copy whose app's stylesheet imports `tone.css` with `@import`, a part of
// its CSS. The page links the stylesheet, and the host does not import it:
// the `<link>` is all the page has of its CSS.
function serveLinkedCopy() {
  return serveCopy((copy) => {
    fs.writeFileSync(path.join(copy, "app/tone.css"), "h2 { color: rgb(255, 0, 0); }\n");
    const globals = path.join(copy, "app/globals.css");
    fs.writeFileSync(globals, `@import "./tone.css";\n${fs.readFileSync(globals, "utf8")}`);
  });
}

// A property of the style of the first element that `selector` matches.
const styleOf = (page: Page, selector: string, property: string) =>
  page.evaluate(
    ([selector, property]) =>
      getComputedStyle(document.querySelector(selector)!).getPropertyValue(property),
    [selector, property],
  );

// Vite's client swaps the `<link>` of a stylesheet that changed, as it does
// for one in the HTML of a page: the page stays, with its state.
test("a change of a stylesheet of the app updates the page's link in place", async ({ page }) => {
  const { copy, url } = await serveLinkedCopy();
  await openPage(page, url);
  expect(await styleOf(page, "body", "margin-top")).toBe("32px");
  const globals = path.join(copy, "app/globals.css");
  fs.writeFileSync(globals, fs.readFileSync(globals, "utf8").replace("2rem", "3rem"));
  await expect.poll(() => styleOf(page, "body", "margin-top"), { timeout: 30_000 }).toBe("48px");
  expect(await page.evaluate(() => "__beforeTheChange" in window)).toBe(true);
});

test("a change of a stylesheet that a stylesheet of the app imports updates the link in place", async ({
  page,
}) => {
  const { copy, url } = await serveLinkedCopy();
  await openPage(page, url);
  expect(await styleOf(page, "h2", "color")).toBe("rgb(255, 0, 0)");
  fs.writeFileSync(path.join(copy, "app/tone.css"), "h2 { color: rgb(0, 128, 0); }\n");
  await expect.poll(() => styleOf(page, "h2", "color"), { timeout: 30_000 }).toBe("rgb(0, 128, 0)");
  expect(await page.evaluate(() => "__beforeTheChange" in window)).toBe(true);
});

// The path of a stylesheet that Next links has each segment encoded as a
// URL component: in a dynamic route and in a slot it differs from the URL of
// the file.
function serveRoutesCopy() {
  return serveCopy((copy) => {
    const write = (file: string, content: string) => {
      fs.mkdirSync(path.dirname(path.join(copy, file)), { recursive: true });
      fs.writeFileSync(path.join(copy, file), content);
    };
    write("app/notes/[slug]/note.css", "h1 { color: rgb(255, 0, 0); }\n");
    write(
      "app/notes/[slug]/page.tsx",
      'import "./note.css";\n\nexport default function Note() {\n  return <h1>A note</h1>;\n}\n',
    );
    write("app/@modal/modal.css", "aside { color: rgb(255, 0, 0); }\n");
    write(
      "app/@modal/default.tsx",
      'import "./modal.css";\n\nexport default function Modal() {\n  return <aside>A modal</aside>;\n}\n',
    );
    const layout = path.join(copy, "app/layout.tsx");
    fs.writeFileSync(
      layout,
      fs
        .readFileSync(layout, "utf8")
        .replace(
          "{ children }: { children: ReactNode }",
          "{ children, modal }: { children: ReactNode; modal: ReactNode }",
        )
        .replace("<main>{children}</main>", "<main>{children}</main>\n        {modal}"),
    );
  });
}

test("a change of a stylesheet in a dynamic route and in a slot updates it in place", async ({
  page,
}) => {
  const { copy, url } = await serveRoutesCopy();
  await openPage(page, `${url}&url=/notes/a`);
  expect(await styleOf(page, "h1", "color")).toBe("rgb(255, 0, 0)");
  expect(await styleOf(page, "aside", "color")).toBe("rgb(255, 0, 0)");
  fs.writeFileSync(path.join(copy, "app/notes/[slug]/note.css"), "h1 { color: rgb(0, 128, 0); }\n");
  await expect.poll(() => styleOf(page, "h1", "color"), { timeout: 30_000 }).toBe("rgb(0, 128, 0)");
  fs.writeFileSync(path.join(copy, "app/@modal/modal.css"), "aside { color: rgb(0, 128, 0); }\n");
  await expect
    .poll(() => styleOf(page, "aside", "color"), { timeout: 30_000 })
    .toBe("rgb(0, 128, 0)");
  expect(await page.evaluate(() => "__beforeTheChange" in window)).toBe(true);
});

// Next's development code puts the time of the request in the URL of a
// stylesheet, `?v=`, so every render of the page links it at another URL,
// and React keeps the links before. Each of them moves, or the one that is
// last would win with the CSS of before.
test("every link of a stylesheet moves, also after the page rendered again", async ({ page }) => {
  const { copy, url } = await serveCopy((copy) => {
    fs.writeFileSync(
      path.join(copy, "app/components/refresh.tsx"),
      '"use client";\n\nimport { useRouter } from "next/navigation";\n\n' +
        "export function Refresh() {\n  const router = useRouter();\n" +
        "  return <button onClick={() => router.refresh()}>Refresh</button>;\n}\n",
    );
    const home = path.join(copy, "app/page.tsx");
    fs.writeFileSync(
      home,
      `import { Refresh } from "./components/refresh.tsx";\n${fs.readFileSync(home, "utf8")}`.replace(
        "<h1>Home</h1>",
        "<h1>Home</h1>\n      <Refresh />",
      ),
    );
  });
  await openPage(page, url);
  const globalsLinks = () =>
    page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLLinkElement>("link[rel=stylesheet]"))
        .map((link) => link.href)
        .filter((href) => href.includes("/app/globals.css")),
    );
  await page.getByRole("button", { name: "Refresh" }).click();
  await expect.poll(async () => (await globalsLinks()).length, { timeout: 30_000 }).toBe(2);
  const before = await globalsLinks();
  const globals = path.join(copy, "app/globals.css");
  fs.writeFileSync(globals, fs.readFileSync(globals, "utf8").replace("2rem", "3rem"));
  await expect.poll(() => styleOf(page, "body", "margin-top"), { timeout: 30_000 }).toBe("48px");
  const after = await globalsLinks();
  expect(after.filter((href) => before.includes(href))).toEqual([]);
  expect(new Set(after).size).toBe(1);
  expect(await page.evaluate(() => "__beforeTheChange" in window)).toBe(true);
});

// A stylesheet that a file of the host with "use client" links, through a
// Client Component of the app that imports it: Vite's client swaps its
// `<link>` too, and the host's use of it ends with the copy.
test('a change of a stylesheet that a file with "use client" links updates it in place', async ({
  page,
}) => {
  const { copy, url } = await serveCopy((copy) => {
    fs.writeFileSync(
      path.join(copy, "app/components/tone.css"),
      "button { background-color: rgb(255, 0, 0); }\n",
    );
    const badge = path.join(copy, "app/components/badge.tsx");
    fs.writeFileSync(
      badge,
      fs
        .readFileSync(badge, "utf8")
        .replace('import styles from "./badge.module.css";', '$&\nimport "./tone.css";'),
    );
  });
  await openPage(page, url.replace("view=page", "view=in-place"));
  await page.getByRole("button", { name: "Clicks: 0" }).waitFor();
  expect(await styleOf(page, "button", "background-color")).toBe("rgb(255, 0, 0)");
  fs.writeFileSync(
    path.join(copy, "app/components/tone.css"),
    "button { background-color: rgb(0, 128, 0); }\n",
  );
  await expect
    .poll(() => styleOf(page, "button", "background-color"), { timeout: 30_000 })
    .toBe("rgb(0, 128, 0)");
  expect(await page.evaluate(() => "__beforeTheChange" in window)).toBe(true);
  // A render after a change of the file ends the use of the stylesheet as it
  // was: its copy goes with it, and the new use has one link of it.
  const file = path.join(copy, "host/in-place-badge.tsx");
  fs.writeFileSync(
    file,
    fs.readFileSync(file, "utf8").replace("react: version", "react: version, changed: true"),
  );
  await expect
    .poll(async () => (await page.evaluate(moduleReports)).at(-1), { timeout: 30_000 })
    .toMatchObject({ changed: true });
  const toneLinks = () =>
    page.evaluate(
      () =>
        Array.from(document.querySelectorAll<HTMLLinkElement>("link[rel=stylesheet]")).filter(
          (link) => link.href.includes("/app/components/tone.css"),
        ).length,
    );
  await expect.poll(toneLinks, { timeout: 30_000 }).toBe(1);
  expect(await styleOf(page, "button", "background-color")).toBe("rgb(0, 128, 0)");
  expect(await page.evaluate(() => "__beforeTheChange" in window)).toBe(true);
});

// A host that uses a file with "use client" without importing it again
// after a change, as `?view=module` does: a change of a stylesheet that the
// file links is no change of the file, and the document stays.
test('a change of a stylesheet that a file with "use client" links keeps a host that does not take changes', async ({
  page,
}) => {
  const { copy, url } = await serveCopy((copy) => {
    fs.writeFileSync(
      path.join(copy, "app/components/tone.css"),
      "button { background-color: rgb(255, 0, 0); }\n",
    );
    const badge = path.join(copy, "app/components/badge.tsx");
    fs.writeFileSync(
      badge,
      fs
        .readFileSync(badge, "utf8")
        .replace('import styles from "./badge.module.css";', '$&\nimport "./tone.css";'),
    );
  });
  await openPage(page, url.replace("view=page", "view=module"));
  await page.getByRole("button", { name: "Clicks: 0" }).waitFor();
  expect(await styleOf(page, "button", "background-color")).toBe("rgb(255, 0, 0)");
  fs.writeFileSync(
    path.join(copy, "app/components/tone.css"),
    "button { background-color: rgb(0, 128, 0); }\n",
  );
  await expect
    .poll(() => styleOf(page, "button", "background-color"), { timeout: 30_000 })
    .toBe("rgb(0, 128, 0)");
  expect(await page.evaluate(() => "__beforeTheChange" in window)).toBe(true);
});

// Two readers of one file with "use client": the host, with
// `loadClientModule()`, and another file of the host that imports it in the
// browser layer, as a docs page imports the stories it shows. Both have the
// one evaluation of the file for every version of it.
test('a file with "use client" is one evaluation for the host and a file that imports it', async ({
  page,
}) => {
  const { copy, url } = await serveCopy();
  await openPage(page, url.replace("view=page", "view=in-place"));
  await page.getByRole("button", { name: "Clicks: 0" }).waitFor();
  expect(await page.evaluate(oneNote)).toBe(true);
  // A change of the file that imports it, which the host renders again.
  await page.evaluate(forgetOneNote);
  const file = path.join(copy, "host/in-place-badge.tsx");
  fs.writeFileSync(file, `${fs.readFileSync(file, "utf8")}\nexport const changed = true;\n`);
  await expect.poll(() => page.evaluate(oneNote), { timeout: 30_000 }).toBeDefined();
  expect(await page.evaluate(oneNote)).toBe(true);
  expect(await page.evaluate(moduleReports)).toHaveLength(2);
  expect(await page.evaluate(noteReports)).toHaveLength(1);
  // A change of the file itself: a new evaluation, which both have.
  await page.evaluate(forgetOneNote);
  const note = path.join(copy, "host/in-place-note.tsx");
  fs.writeFileSync(note, fs.readFileSync(note, "utf8").replace("A note", "A changed note"));
  await expect.poll(() => page.evaluate(oneNote), { timeout: 30_000 }).toBeDefined();
  expect(await page.evaluate(oneNote)).toBe(true);
  expect(await page.evaluate(noteReports)).toHaveLength(2);
  expect(await page.evaluate(moduleReports)).toHaveLength(3);
  expect(await page.evaluate(() => "__beforeTheChange" in window)).toBe(true);
});
