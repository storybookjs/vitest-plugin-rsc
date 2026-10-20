import { expect, test, vi } from "vitest";
import { beforeEach } from "./client-story.ts";

// What the plugin's testing library is asked, and how a use goes.
const uses = vi.hoisted((): { files: string[]; signal: AbortSignal }[] => []);
let linking: (signal: AbortSignal) => Promise<void> = async () => {};
vi.mock("vitest-plugin-rsc/nextjs/testing-library", () => ({
  linkStylesheetsOf: (files: string[], { signal }: { signal: AbortSignal }) => {
    uses.push({ files, signal });
    return linking(signal);
  },
}));

type Context = Parameters<typeof beforeEach>[0];
const story = (fileName: string, abortSignal = new AbortController().signal) =>
  ({ parameters: { fileName }, abortSignal }) as unknown as Context;

test("a client story links the stylesheets of its file for as long as its signal says", async () => {
  vi.stubEnv("STORYBOOK_NEXTJS_RSC_WORKING_DIR", "web");
  const shown = new AbortController();

  expect(await beforeEach(story("./stories/button.stories.tsx", shown.signal))).toBeUndefined();
  expect(uses).toEqual([{ files: ["web/stories/button.stories.tsx"], signal: shown.signal }]);
});

test("a client story that Storybook leaves before its stylesheets load ends at once", async () => {
  vi.stubEnv("STORYBOOK_NEXTJS_RSC_WORKING_DIR", ".");
  const leave = new AbortController();
  linking = (signal) =>
    new Promise((_, reject) => signal.addEventListener("abort", () => reject(signal.reason)));

  const ended = beforeEach(story("./button.stories.tsx", leave.signal));
  leave.abort();
  await expect(ended).resolves.toBeUndefined();

  // An error of its own is the story's.
  linking = async () => {
    throw new Error("the dev server is gone");
  };
  await expect(beforeEach(story("./button.stories.tsx"))).rejects.toThrow("the dev server is gone");
});
