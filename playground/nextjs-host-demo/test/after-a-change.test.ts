import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Page } from "playwright";
import { afterAll, beforeAll, expect } from "vitest";
import { copyProject } from "../../test-helpers/build.ts";
import { createProject, test, type DevServer } from "../../test-helpers/host.ts";

// A change of a file of the app while the host has a page of the app open,
// on Vite's dev server without Vitest. In a copy of the project, which the
// test changes, so that the dev servers of the other tests do not see it.

const root = fileURLToPath(new URL("../", import.meta.url));
const copy = fs.mkdtempSync(path.join(root, "..", ".nextjs-host-demo-"));
copyProject(root, copy);
const greeting = path.join(copy, "app/components/greeting.tsx");

let site: DevServer | undefined;

beforeAll(async () => {
  site = await createProject(copy).serve((port) => [
    "vite",
    "--configLoader",
    "native",
    "--port",
    String(port),
    "--strictPort",
  ]);
});

afterAll(async () => {
  await site?.close();
  fs.rmSync(copy, { recursive: true, force: true });
});

const hostState = () => (window as { __hostState?: string }).__hostState;

// The page of the app at `/`, which shows the greeting, in the host's
// document, once it has loaded.
async function openPage(page: Page) {
  await page.goto(`${site!.url}?view=page`);
  await page.waitForFunction(hostState);
  expect(await page.evaluate(hostState)).toBe("ready");
  await page.evaluate(() => Object.assign(window, { __beforeTheChange: true }));
}

// Changes the greeting of the app, and resolves once the host's document has
// loaded again, with the page as the app is now.
async function changeGreeting(page: Page, greetingWord: string) {
  const source = fs.readFileSync(greeting, "utf8");
  fs.writeFileSync(greeting, source.replace(/<h2>\w+ from/, `<h2>${greetingWord} from`));
  await page.waitForFunction(
    () => !("__beforeTheChange" in window) && (window as { __hostState?: string }).__hostState,
  );
  expect(await page.evaluate(() => (window as { __hostState?: string }).__hostState)).toBe("ready");
  await page.getByRole("heading", { name: `${greetingWord} from the page` }).waitFor();
}

test("a change of a file of the app loads the host's document again", async ({ page }) => {
  await openPage(page);
  await changeGreeting(page, "Hi");
});

test("also for a host that takes a change of its own modules in place", async ({ page }) => {
  // As a framework does that renders its modules again after a change: the
  // runtime of the plugin is one of them.
  const main = path.join(copy, "host/main.tsx");
  fs.appendFileSync(main, "\nimport.meta.hot?.accept();\n");
  await openPage(page);
  await changeGreeting(page, "Hey");
});
