import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, expect } from "vitest";
import { copyProject } from "../../test-helpers/build.ts";
import { createProject, test, type DevServer } from "../../test-helpers/host.ts";
import { openStory, storyRun } from "../../test-helpers/storybook.ts";

// `storybook dev` after a change of a file, as a user edits one with a story
// open. In a copy of the project, which the test changes, so that the other
// tests do not see it.

const root = fileURLToPath(new URL("../", import.meta.url));
const copy = fs.mkdtempSync(path.join(root, "..", ".nextjs-host-demo-"));
copyProject(root, copy);

let site: DevServer | undefined;

beforeAll(async () => {
  site = await createProject(copy, { env: { STORYBOOK_DISABLE_TELEMETRY: "1" } }).serve(
    (port) => ["storybook", "dev", "--port", String(port), "--ci", "--exact-port"],
    { timeout: 120_000 },
  );
});

afterAll(async () => {
  await site?.close();
  fs.rmSync(copy, { recursive: true, force: true });
});

function change(file: string, from: string, to: string) {
  const changed = path.join(copy, file);
  const source = fs.readFileSync(changed, "utf8");
  expect(source).toContain(from);
  fs.writeFileSync(changed, source.replace(from, to));
}

test("a client story has the project's decorator after a change of its file", async ({ page }) => {
  const canvas = await openStory(page, site!.url, "press-button--labelled");
  change("stories/press-button.stories.tsx", 'label: "Labelled"', 'label: "Relabelled"');
  // The components of the story file and of the preview file, both as the
  // browser layer evaluated them after the change.
  const button = canvas.locator("#storybook-root").getByRole("button", { name: "Relabelled: 0" });
  await expect.poll(() => button.getAttribute("data-theme"), { timeout: 30_000 }).toBe("storybook");
});

test("a page story renders again after a change of its file", async ({ page }) => {
  const canvas = await openStory(page, site!.url, "home--home");
  change("stories/home.stories.tsx", 'url: "/"', 'url: "/?changed"');
  await expect.poll(() => new URL(canvas.url()).search, { timeout: 30_000 }).toBe("?changed");
  expect(await storyRun(page, canvas, "home--home")).toMatchObject({
    phase: "finished",
    reports: [],
  });
});
