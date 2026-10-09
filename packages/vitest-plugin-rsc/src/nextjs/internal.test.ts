import { expect, test, vi } from "vitest";
import { clientFileOf, referToUiFile } from "./internal.ts";

// What the plugin gives the code of the page. This test runs in Node, without
// the plugin: a dev server, where the page has no built layers.
vi.mock("virtual:vitest-plugin-rsc/layers", () => ({ default: undefined, hostModules: undefined }));
vi.mock("virtual:vitest-plugin-rsc/vite-client", () => ({ createHotContext: undefined }));

test("refers to each export of a file of a UI of the host, without loading it", () => {
  const exports = referToUiFile("/@fs/stories/intro.mdx", ["default", "title"]);

  expect(Object.keys(exports)).toEqual(["default", "title"]);
  expect(clientFileOf(exports.default)).toMatchObject({
    module: "/@fs/stories/intro.mdx",
    name: "default",
  });
  expect(clientFileOf(exports.title)).toMatchObject({ name: "title" });
  // The stand-in is no export to call: the host imports the file for it.
  expect(() => (exports.default as () => void)()).toThrow(
    "default of /@fs/stories/intro.mdx is code of the browser layer",
  );
  // Another module, or a value that is not an export of one.
  expect(clientFileOf(() => {})).toBeUndefined();
  expect(clientFileOf("default")).toBeUndefined();
});

test("tells apart the stand-ins of a file that the rsc layer evaluated again", () => {
  const before = referToUiFile("/@fs/stories/intro.mdx", ["default"]);
  const after = referToUiFile("/@fs/stories/intro.mdx", ["default"]);

  const load = (value: unknown) => (clientFileOf(value) as { load?: object } | undefined)?.load;
  expect(load(before.default)).toBeDefined();
  expect(load(before.default)).not.toBe(load(after.default));
});
