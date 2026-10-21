import { expect, test, vi } from "vitest";
import { beforeEach } from "./client-story.ts";

// What the plugin's entry of Client Components is asked, and how a use goes.
const uses = vi.hoisted((): { files: string[]; signal: AbortSignal }[] => []);
let linking: (signal: AbortSignal) => Promise<void> = async () => {};
const kept = vi.hoisted(() => ({ reports: [] as ((url: URL) => void)[], stops: 0 }));
vi.mock("vitest-plugin-rsc/nextjs/client-components", () => ({
  keepHostDocument: (report: (url: URL) => void) => {
    kept.reports.push(report);
    return () => kept.stops++;
  },
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
  // New args, in the same render: the same use.
  await beforeEach(story("./stories/button.stories.tsx", shown.signal));
  expect(uses).toHaveLength(1);
});

test("a client story that Storybook leaves before its stylesheets load ends at once", async () => {
  vi.stubEnv("STORYBOOK_NEXTJS_RSC_WORKING_DIR", ".");
  const leave = new AbortController();
  linking = (signal) =>
    new Promise((_, reject) => signal.addEventListener("abort", () => reject(signal.reason)));

  // With the signal's reason, which Storybook takes as the end of the render.
  const ended = beforeEach(story("./button.stories.tsx", leave.signal));
  leave.abort();
  await expect(ended).rejects.toBe(leave.signal.reason);
});

test("a client story keeps the preview until Storybook leaves it, once for a render", async () => {
  vi.stubEnv("STORYBOOK_NEXTJS_RSC_WORKING_DIR", ".");
  const shown = new AbortController();
  const before = kept.reports.length;
  linking = async () => {};

  await beforeEach(story("./link.stories.tsx", shown.signal));
  await beforeEach(story("./link.stories.tsx", shown.signal));
  expect(kept.reports).toHaveLength(before + 1);
  const stops = kept.stops;
  shown.abort();
  expect(kept.stops).toBe(stops + 1);
});
