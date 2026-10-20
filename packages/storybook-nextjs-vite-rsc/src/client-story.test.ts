import { expect, test, vi } from "vitest";
import { beforeEach } from "./client-story.ts";

// What the plugin's testing library is asked, in order.
const calls = vi.hoisted((): unknown[][] => []);
vi.mock("vitest-plugin-rsc/nextjs/testing-library", () => ({
  linkStylesheetsOf: async (files: string[]) => {
    calls.push(["linkStylesheetsOf", files]);
  },
  cleanup: async () => {
    calls.push(["cleanup"]);
  },
}));

type Context = Parameters<typeof beforeEach>[0];
const story = (fileName: string) => ({ parameters: { fileName } }) as unknown as Context;

test("a client story links the stylesheets of its file, until Storybook leaves it", async () => {
  vi.stubEnv("STORYBOOK_NEXTJS_RSC_WORKING_DIR", "web");

  const teardown = (await beforeEach(story("./stories/button.stories.tsx"))) as () => Promise<void>;
  expect(calls).toEqual([["linkStylesheetsOf", ["web/stories/button.stories.tsx"]]]);

  await teardown();
  expect(calls).toEqual([["linkStylesheetsOf", ["web/stories/button.stories.tsx"]], ["cleanup"]]);
});
