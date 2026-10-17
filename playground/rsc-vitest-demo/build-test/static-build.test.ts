import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Page } from "playwright";
import { afterAll, beforeAll, describe, expect, onTestFinished } from "vitest";
import {
  copyProject,
  filesOf,
  filesWithMachinePaths,
  hashesOf,
  viteBuild,
} from "../../test-helpers/build.ts";
import { serveFiles, test, type Site } from "../../test-helpers/host.ts";

// The Server Components of the host in a static build of `vitestPluginRSC()`
// on its own, which `vite build` makes with Vite's app builder: see
// vite.config.ts. A server of files serves the directory, and nothing else.
// The page of `index.html` hosts them, see host/main.tsx.
//
// One build, of production: `vite build` builds React's production code, and
// the plugin has no option for another build without Next.js.

const root = fileURLToPath(new URL("../", import.meta.url));
const repository = path.resolve(root, "../..");

/** Opens the host page, and waits until it has rendered. */
async function open(page: Page, site: Site): Promise<void> {
  await page.goto(site.url);
  await page.waitForFunction(() => (window as { __hostState?: string }).__hostState);
  const host = await page.evaluate(() => {
    const state = window as { __hostState?: string; __hostError?: unknown };
    return { state: state.__hostState, error: String(state.__hostError) };
  });
  expect(host.state, `the host (${host.error})`).toBe("ready");
}

const color = (page: Page, role: "heading" | "button", name: string) =>
  page.getByRole(role, { name }).evaluate((element) => getComputedStyle(element).color);

describe("a static build", () => {
  const dist = path.join(root, "dist");
  let site: Site;
  beforeAll(async () => {
    await viteBuild(root, dist);
    site = await serveFiles(dist);
  });
  afterAll(() => site?.close());

  test("has the browser layer in one file, and no path of the machine", () => {
    const files = filesOf(dist);
    expect(files).toContain("index.html");
    expect(files).toContain("vitest-plugin-rsc/react_client/modules.json");
    // No ssr layer: that is Next's.
    expect(files.filter((file) => file.endsWith("modules.json"))).toEqual([
      "vitest-plugin-rsc/react_client/modules.json",
    ]);
    // The key of the inline Server Action, which is the same in every build.
    expect(files).toContain("__vite_rsc_encryption_key.js");
    expect(filesWithMachinePaths(dist, repository)).toEqual({});
  });

  // The same tree, built in another directory, is the same build.
  test("is the same build in another directory", async () => {
    const copy = fs.mkdtempSync(path.join(root, "..", ".rsc-vitest-demo-"));
    onTestFinished(() => fs.rmSync(copy, { recursive: true, force: true }));
    copyProject(root, copy);
    const moved = path.join(copy, "dist");
    await viteBuild(copy, moved);
    expect(hashesOf(moved)).toEqual(hashesOf(dist));
  });

  test("renders a Server Component with a Client Component", async ({ page }) => {
    await open(page, site);
    await page.getByRole("heading", { name: "Greetings from the host" }).waitFor();
    await page.getByRole("button", { name: "Count: 0" }).click();
    await page.getByRole("button", { name: "Count: 1" }).click();
    await page.getByRole("button", { name: "Count: 2" }).waitFor();
  });

  // An inline one from a form of the Server Component, with a variable it
  // keeps, which renders the Server Component again, and one that only the
  // Client Component imports, which answers with a value.
  test("runs Server Actions", async ({ page }) => {
    await open(page, site);
    const greetings = page.getByRole("list", { name: "Greetings" });
    await greetings.getByText("Hello", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Greet from the server" }).click();
    await greetings.getByText("Hello from the host").waitFor();

    await page.getByRole("button", { name: "Count: 0" }).click();
    await page.getByRole("button", { name: "Count: 1" }).click();
    await page.getByRole("button", { name: "Count: 2" }).waitFor();
    await page.getByRole("button", { name: "Double on the server" }).click();
    await page.getByRole("button", { name: "Count: 4" }).waitFor();
  });

  // The CSS of the Server Component, which the HTML links, and of the Client
  // Component, which Vite loads with its chunk of the browser layer.
  test("loads the CSS of a Server Component and a Client Component", async ({ page }) => {
    await open(page, site);
    expect(await color(page, "heading", "Greetings from the host")).toBe("rgb(0, 0, 255)");
    expect(await color(page, "button", "Count: 0")).toBe("rgb(128, 0, 0)");
  });
});
