import { expect, test, vi } from "vitest";
import { stylesheets } from "./client-story.ts";

// What the plugin's entry of Client Components is asked, and how a use goes.
const uses = vi.hoisted((): { files: string[]; signal: AbortSignal }[] => []);
let linking: (signal: AbortSignal) => Promise<void> = async () => {};
vi.mock("vitest-plugin-rsc/nextjs/client-components", () => ({
  linkStylesheetsOf: (files: string[], { signal }: { signal: AbortSignal }) => {
    uses.push({ files, signal });
    return linking(signal);
  },
}));

type Context = Parameters<typeof stylesheets>[0];
const story = (fileName: string, abortSignal = new AbortController().signal) =>
  ({ parameters: { fileName }, abortSignal }) as unknown as Context;

test("a client story links the stylesheets of its file for as long as its signal says", async () => {
  vi.stubEnv("STORYBOOK_NEXTJS_RSC_WORKING_DIR", "web");
  const shown = new AbortController();

  expect(await stylesheets(story("./stories/button.stories.tsx", shown.signal))).toBeUndefined();
  expect(uses).toEqual([{ files: ["web/stories/button.stories.tsx"], signal: shown.signal }]);
  // New args, in the same render: the same use.
  await stylesheets(story("./stories/button.stories.tsx", shown.signal));
  expect(uses).toHaveLength(1);
});

test("a client story that Storybook leaves before its stylesheets load ends at once", async () => {
  vi.stubEnv("STORYBOOK_NEXTJS_RSC_WORKING_DIR", ".");
  const leave = new AbortController();
  linking = (signal) =>
    new Promise((_, reject) => signal.addEventListener("abort", () => reject(signal.reason)));

  // With the signal's reason, which Storybook takes as the end of the render.
  const ended = stylesheets(story("./button.stories.tsx", leave.signal));
  leave.abort();
  await expect(ended).rejects.toBe(leave.signal.reason);
});
