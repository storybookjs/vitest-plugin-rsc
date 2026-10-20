import { expect, test, vi } from "vitest";
import { beforeEach, loadedClientModule } from "./client-renderer.ts";

// What the plugin's testing library is asked, in order.
const calls = vi.hoisted((): unknown[][] => []);
vi.mock("vitest-plugin-rsc/nextjs/testing-library", () => ({
  linkStylesheetsOf: async (imported: object) => {
    calls.push(["linkStylesheetsOf", imported]);
  },
  cleanup: async () => {
    calls.push(["cleanup"]);
  },
}));

type Context = Parameters<typeof beforeEach>[0];
const story = (fileName: string) => ({ parameters: { fileName } }) as unknown as Context;

test("a client story uses the module of its file, until Storybook leaves it", async () => {
  const reference = {};
  loadedClientModule("./button.stories.tsx", reference);

  const teardown = (await beforeEach(story("./button.stories.tsx"))) as () => Promise<void>;
  expect(calls).toEqual([["linkStylesheetsOf", reference]]);

  await teardown();
  expect(calls).toEqual([["linkStylesheetsOf", reference], ["cleanup"]]);
});
