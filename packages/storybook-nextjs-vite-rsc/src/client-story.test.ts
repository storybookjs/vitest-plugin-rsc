import { expect, test, vi } from "vitest";
import { beforeEach } from "./client-story.ts";

// What the plugin's testing library is asked, in order, and when the
// stylesheets it links have loaded.
const calls = vi.hoisted((): unknown[][] => []);
let linking: Promise<void> = Promise.resolve();
vi.mock("vitest-plugin-rsc/nextjs/testing-library", () => ({
  linkStylesheetsOf: (files: string[]) => {
    calls.push(["linkStylesheetsOf", files]);
    return linking;
  },
  cleanup: async () => {
    calls.push(["cleanup"]);
  },
}));

type Context = Parameters<typeof beforeEach>[0];
const story = (fileName: string, abortSignal = new AbortController().signal) =>
  ({ parameters: { fileName }, abortSignal }) as unknown as Context;

test("a client story links the stylesheets of its file, until Storybook leaves it", async () => {
  vi.stubEnv("STORYBOOK_NEXTJS_RSC_WORKING_DIR", "web");

  const teardown = (await beforeEach(story("./stories/button.stories.tsx"))) as () => Promise<void>;
  expect(calls).toEqual([["linkStylesheetsOf", ["web/stories/button.stories.tsx"]]]);

  await teardown();
  expect(calls).toEqual([["linkStylesheetsOf", ["web/stories/button.stories.tsx"]], ["cleanup"]]);
});

test("a client story that Storybook leaves before its stylesheets load ends at once", async () => {
  vi.stubEnv("STORYBOOK_NEXTJS_RSC_WORKING_DIR", ".");
  const leave = new AbortController();
  linking = new Promise(() => {});
  const ended = beforeEach(story("./button.stories.tsx", leave.signal));
  leave.abort();

  expect(await ended).toBeTypeOf("function");
});
