import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, expect } from "vitest";
import { createProject, test, type DevServer } from "../../test-helpers/host.ts";
import type { HostWindow } from "../host/state.ts";
import { open as openView } from "./host-page.ts";
import { expectReferencesRender, type OpenView } from "./references-page.ts";

// Client references in JSX of the rsc layer, which the React of the browser
// layer renders in the host's document: see references-page.ts.

const root = fileURLToPath(new URL("../", import.meta.url));
let site: DevServer | undefined;

beforeAll(async () => {
  site = await createProject(root).serve((port) => [
    "vite",
    "--configLoader",
    "native",
    "--port",
    String(port),
    "--strictPort",
  ]);
});

afterAll(() => site?.close());

const open: OpenView = (page, errors, view, run) => openView(page, errors, site!, view, run);

test("renders client references with the React of the browser layer", async ({ page, errors }) => {
  await expectReferencesRender(page, errors, open);
});

test("act() waits for a client reference that is not loaded yet", async ({ page, errors }) => {
  await expectReferencesRender(page, errors, open, "&act");
});

test("renders client references in StrictMode", async ({ page, errors }) => {
  await expectReferencesRender(page, errors, open, "&act&strict");
});

// What the plugin's hold of act() is for: React's own act() resolves before
// a root that suspended at its shell commits. A React that waits itself
// fails this test, and act-hold.ts can go.
test("React's act() resolves before a root that suspended has committed", async ({
  page,
  errors,
}) => {
  await open(page, errors, "act-canary", async () => {});
  expect(await page.evaluate(() => (window as HostWindow).__hostActCanary)).toBe(false);
});

test("a reference whose file fails to load throws in its error boundary, and act() resolves", async ({
  page,
  errors,
}) => {
  await open(page, errors, "references-failed", async () => {});
  const failed = await page.evaluate(() => (window as HostWindow).__hostFailed!);
  expect(failed.atResolve).toContain("broken.tsx fails as it loads");
  expect(failed.caught).toEqual([expect.stringContaining("broken.tsx fails as it loads")]);
});

test("a reference to a file of the host renders the evaluation of its last import", async ({
  page,
  errors,
}) => {
  await open(page, errors, "references-reimported", async () => {});
  const seen = await page.evaluate(() => (window as HostWindow).__hostReimported!);
  expect(seen.first).not.toBe(seen.again);
  expect(seen.before).toBe(seen.first);
  expect(seen.after).toBe(seen.again);
});

test("a client reference called as a function throws", async ({ page, errors }) => {
  await open(page, errors, "references-called", async () => {});
  const called = await page.evaluate(() => (window as HostWindow).__hostCalled);
  expect(called).toMatch(/is a Client Component and cannot be called on the server/);
});
