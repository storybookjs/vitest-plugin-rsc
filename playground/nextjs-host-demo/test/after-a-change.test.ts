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
  await page.waitForFunction(
    () => !("__beforeTheChange" in window) && (window as HostWindow).__hostState,
  );
  expect(await page.evaluate(hostState), await page.evaluate(hostError)).toBe("ready");
  await page.getByRole("heading", { name: `${greetingWord} from the page` }).waitFor();
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
