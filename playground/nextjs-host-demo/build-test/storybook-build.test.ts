import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, expect } from "vitest";
import { filesWithMachinePaths } from "../../test-helpers/build.ts";
import { createProject, serveFiles, test, type Site } from "../../test-helpers/host.ts";
import { openStory, runStory, storyRun, type StoryRun } from "../../test-helpers/storybook.ts";

// `storybook build` of the project with @storybook/nextjs-vite-rsc, which
// builds the layers with Vite's app builder, behind a server of files: the
// stories of test/storybook.test.ts, without a dev server.

const root = fileURLToPath(new URL("../", import.meta.url));
const repository = path.resolve(root, "../..");
// Not in the project, where the dev server of test/storybook.test.ts would
// see the build.
const out = fs.mkdtempSync(path.join(os.tmpdir(), "nextjs-host-demo-storybook-"));

let site: Site | undefined;

beforeAll(async () => {
  await createProject(root, { env: { STORYBOOK_DISABLE_TELEMETRY: "1" } }).run(
    "storybook",
    "build",
    "--output-dir",
    out,
  );
  site = await serveFiles(out);
});

afterAll(async () => {
  await site?.close();
  fs.rmSync(out, { recursive: true, force: true });
});

const passed: StoryRun = { phase: "finished", reports: [], interactions: "PASS" };

// What the layers built. Storybook's docgen of a component, in `services/`,
// names its file by its path on the machine.
test("has no path of the machine that built it, but in Storybook's docgen", () => {
  const files = Object.keys(filesWithMachinePaths(out, repository));
  expect(files.filter((file) => !file.startsWith("services/core/docgen/"))).toEqual([]);
});

test("server stories, a page, a Server Action and client stories", async ({ page }) => {
  const canvas = await openStory(page, site!.url, "greeting--default");
  expect(await storyRun(page, canvas, "greeting--default")).toEqual(passed);
  expect(await runStory(page, canvas, "home--home")).toEqual(passed);
  expect(await runStory(page, canvas, "greeting--server-action")).toEqual(passed);
  expect(await runStory(page, canvas, "press-button--pressed")).toEqual(passed);
  // The CSS module of the component, from the build.
  await expect
    .poll(() =>
      canvas
        .getByRole("button", { name: "Press: 1" })
        .evaluate((element) => getComputedStyle(element).color),
    )
    .toBe("rgb(0, 0, 255)");
});
