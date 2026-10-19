import { definePreview } from "storybook/internal/csf";
import { expect, test, vi } from "vitest";
import { load } from "./load.ts";
import { defineServerPreview } from "./server.ts";

// A module of a file with "use client" is the plugin's client reference
// module, for which `loadClientModule()` gives the browser layer's exports.
const browser = new WeakMap<object, object>();
vi.mock("vitest-plugin-rsc/nextjs/testing-library", () => ({
  loadClientModule: async (module: object) => browser.get(module) ?? module,
}));

// A file with "use client", as the rsc layer imports it.
const clientFile = (exports: object) => {
  const reference = {};
  browser.set(reference, exports);
  return reference;
};

const importOf = (modules: Record<string, object>) => async (path: string) => modules[path]!;

const clientPreview = definePreview({ initialGlobals: { theme: "light" } });
const serverPreview = defineServerPreview({});

// The project's preview loads first, as Storybook loads it.
await load(
  "./.storybook/preview.tsx",
  importOf({ "./.storybook/preview.tsx": clientFile({ default: clientPreview }) }),
);

test('a file with "use client" is the browser layer\'s module, any other as it is', async () => {
  const client = { Default: clientPreview.meta({}).story() };
  const server = { Default: serverPreview.meta({}).story() };
  const modules = { "./client.stories.tsx": clientFile(client), "./server.stories.tsx": server };
  expect(await load("./client.stories.tsx", importOf(modules))).toBe(client);
  expect(await load("./server.stories.tsx", importOf(modules))).toBe(server);
});

test("an MDX file is a docs page, of the browser layer", async () => {
  const page = { default: () => null };
  expect(await load("./intro.mdx", importOf({ "./intro.mdx": clientFile(page) }))).toBe(page);
});

test("a story file without a story of meta.story() is an error", async () => {
  const csf3 = { default: { title: "Button" }, Primary: { args: {} } };
  await expect(
    load("./csf3.stories.tsx", importOf({ "./csf3.stories.tsx": csf3 })),
  ).rejects.toThrow("./csf3.stories.tsx has no story of meta.story()");
});

test("the factory of the other layer is an error, for a story file and the preview", async () => {
  const modules = {
    "./client.stories.tsx": clientFile({ Default: serverPreview.meta({}).story() }),
    "./server.stories.tsx": { Default: clientPreview.meta({}).story() },
    "./.storybook/preview.tsx": { default: clientPreview },
  };
  await expect(load("./client.stories.tsx", importOf(modules))).rejects.toThrow(
    './client.stories.tsx has "use client", so its stories render in the browser',
  );
  await expect(load("./server.stories.tsx", importOf(modules))).rejects.toThrow(
    './server.stories.tsx has no "use client", so it is server code',
  );
  await expect(load("./.storybook/preview.tsx", importOf(modules))).rejects.toThrow(
    './.storybook/preview.tsx has no "use client"',
  );
});

test("a global of a server preview that preview.tsx does not declare is an error", async () => {
  const declared = defineServerPreview({ initialGlobals: { theme: "dark" } });
  const own = defineServerPreview({ globalTypes: { locale: { name: "Locale" } } });
  const modules = {
    "./declared.stories.tsx": { Default: declared.meta({}).story() },
    "./own.stories.tsx": { Default: own.meta({}).story() },
  };
  await expect(load("./declared.stories.tsx", importOf(modules))).resolves.toBeDefined();
  await expect(load("./own.stories.tsx", importOf(modules))).rejects.toThrow(
    "The preview of ./own.stories.tsx declares the globals locale",
  );
});

test("a server preview with beforeAll is an error", () => {
  expect(() => defineServerPreview({ beforeAll: () => {} })).toThrow(
    "defineServerPreview() got a beforeAll",
  );
});
