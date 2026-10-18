import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll } from "vitest";
import { createProject, serveFiles, test, type Site } from "../../test-helpers/host.ts";
import { runEveryStory } from "./stories.ts";

// `storybook build` of the notes demo behind a server of files: the stories
// of storybook.test.ts, without a dev server.

const root = fileURLToPath(new URL("../", import.meta.url));
// Not in the project, where the dev server of storybook.test.ts would see
// the build.
const out = fs.mkdtempSync(path.join(os.tmpdir(), "nextjs-notes-demo-storybook-"));

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

test("every story renders and plays, at its own URL", async ({ page, errors }) => {
  await runEveryStory(page, site!.url, errors);
});
