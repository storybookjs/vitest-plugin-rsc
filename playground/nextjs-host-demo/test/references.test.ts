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
  const seen = await expectReferencesRender(page, errors, open);
  console.log("no act", JSON.stringify(seen));
});

test("act() waits for a client reference that is not loaded yet", async ({ page, errors }) => {
  const seen = await expectReferencesRender(page, errors, open, "&act");
  console.log("act", JSON.stringify(seen));
});

test("without the hold, act() resolves before the references commit", async ({ page, errors }) => {
  await open(page, errors, "references&act&nohold", async (page) => {
    const seen = await page.evaluate(() => (window as HostWindow).__hostReferences!.atResolve);
    console.log("act nohold", JSON.stringify(seen));
    expect(seen.counter).toBe(null);
  });
});

test("a client reference called as a function throws", async ({ page, errors }) => {
  const host = await open(page, errors, "references-called", async () => {});
  console.log("called", host);
  const called = await page.evaluate(() => (window as HostWindow).__hostCalled);
  expect(called).toMatch(/is a Client Component and cannot be called on the server/);
});
