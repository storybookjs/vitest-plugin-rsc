import fs from "node:fs";
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

test("without the hold, act() resolves before the references commit", async ({
  page,
  errors,
}) => {
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

test("a change of a file that a client reference points at reloads the host's document", async ({
  page,
  errors,
}) => {
  const file = fileURLToPath(new URL("../app/components/reference-box.tsx", import.meta.url));
  const source = fs.readFileSync(file, "utf8");
  await open(page, errors, "references", async (page) => {
    await page.locator("#host-root").getByTestId("counter-first").click();
    await page.evaluate(() => Object.assign(window, { __beforeChange: true }));
    fs.writeFileSync(file, source.replace("{label} {tone} {count}", "{label}! {tone} {count}"));
    try {
      await page.locator("#host-root").getByText("first! dark 0").waitFor({ timeout: 30_000 });
      const after = await page.evaluate(() => ({
        reloaded: !("__beforeChange" in window),
        state: (window as HostWindow).__hostState,
      }));
      console.log("hmr", JSON.stringify(after));
      expect(after).toEqual({ reloaded: true, state: "ready" });
    } finally {
      fs.writeFileSync(file, source);
    }
  });
});
