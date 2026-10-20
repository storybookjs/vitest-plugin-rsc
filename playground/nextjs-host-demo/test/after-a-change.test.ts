import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Page } from "playwright";
import { afterAll, expect } from "vitest";
import { copyProject } from "../../test-helpers/build.ts";
import { createProject, test, type DevServer } from "../../test-helpers/host.ts";
import type { HostWindow } from "../host/state.ts";

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
  return { copy, url: `${site.url}?view=page` };
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
  page.on("console", (m) => frames.push("CONSOLE " + m.text()));
  page.on("request", (r) => r.url().includes("globals") && frames.push("REQ " + r.url()));
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
  expect(await page.evaluate(() => "__beforeTheChange" in window)).toBe(true);
});

// What Tailwind's PostCSS plugin does with a file it scans for class names,
// like a story file: the file is a dependency of the stylesheet, which has
// the CSS of what it finds there. In Vite's module graph the stylesheet
// imports the file, and the root layout of the app imports the stylesheet.
const tonePlugin = `const fs = require("node:fs");
const path = require("node:path");

module.exports = () => ({
  postcssPlugin: "tone",
  Once(root, { result }) {
    if (!root.source.input.file.includes("/app/globals.css")) return;
    const file = path.resolve("host/tone.tsx");
    const [, tone] = /tone = "(.+)"/.exec(fs.readFileSync(file, "utf8"));
    root.append(\`h1 { color: \${tone}; }\`);
    result.messages.push({ type: "dependency", plugin: "tone", file });
  },
});
module.exports.postcss = true;
`;

// The CSS of the stylesheet that the host imports itself, as a preview of
// Storybook imports the app's: Vite's `<style>` of it.
const hostStylesheet = (page: Page) =>
  page.evaluate(
    () => document.querySelector('style[data-vite-dev-id$="/app/globals.css"]')?.textContent,
  );

test("a change of a file that a stylesheet of the app depends on updates the stylesheet in place", async ({
  page,
}) => {
  const { copy, url } = await serveCopy((copy) => {
    // Next's shape of a config of PostCSS: plugins by the name it requires.
    fs.writeFileSync(
      path.join(copy, "postcss.config.mjs"),
      'export default { plugins: { "./postcss-tone.cjs": {} } };\n',
    );
    fs.writeFileSync(path.join(copy, "postcss-tone.cjs"), tonePlugin);
    fs.writeFileSync(path.join(copy, "host/tone.tsx"), 'export const tone = "rgb(255, 0, 0)";\n');
    // A host that imports the app's stylesheet, and takes a change of its
    // own modules in place, as a framework does.
    const main = path.join(copy, "host/main.tsx");
    fs.writeFileSync(
      main,
      `import "../app/globals.css";\n${fs.readFileSync(main, "utf8")}\nimport.meta.hot?.accept();\n`,
    );
  });
  await openPage(page, url);
  expect(await hostStylesheet(page)).toContain("color: rgb(255, 0, 0)");
  const tone = path.join(copy, "host/tone.tsx");
  fs.writeFileSync(tone, 'export const tone = "rgb(0, 128, 0)";\n');
  await expect
    .poll(() => hostStylesheet(page), { timeout: 30_000 })
    .toContain("color: rgb(0, 128, 0)");
  expect(await page.evaluate(() => "__beforeTheChange" in window)).toBe(true);
  // The host imports its module again after a change of it, with the
  // modules of the plugin that it had: the change of the stylesheet left
  // them as they were, though a route imports the stylesheet.
  const fetched = () =>
    page.evaluate(() => performance.getEntriesByType("resource").map((entry) => entry.name));
  const before = (await fetched()).length;
  await page.evaluate(() => delete (window as HostWindow).__hostState);
  fs.appendFileSync(path.join(copy, "host/main.tsx"), "\n// changed\n");
  await page.waitForFunction(hostState, undefined, { timeout: 30_000 });
  expect(await page.evaluate(hostState), await page.evaluate(hostError)).toBe("ready");
  expect((await fetched()).slice(before)).toContainEqual(
    expect.stringContaining("/host/main.tsx?t="),
  );
  const plugin = (await fetched())
    .slice(before)
    .filter((name) => name.includes("vitest-plugin-rsc"));
  expect(plugin).toEqual([]);
  expect(await page.evaluate(() => "__beforeTheChange" in window)).toBe(true);
});
