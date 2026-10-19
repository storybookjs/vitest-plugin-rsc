import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import { afterAll, expect, test, vi } from "vitest";
import * as preset from "@storybook/nextjs-vite-rsc/preset";
import { vitestPluginRSC } from "vitest-plugin-rsc";

// The preset through the package's exports: the source with `pnpm test`, the
// build with `pnpm test:dist`. What it gives vitestPluginNext() is what the
// mock records.
const { vitestPluginNext } = vi.hoisted(() => ({
  vitestPluginNext: vi.fn((_options: object): Plugin[] => [{ name: "vitest-plugin-rsc:next" }]),
}));
vi.mock("vitest-plugin-rsc/nextjs/plugin", () => ({ vitestPluginNext }));

// A project with a Storybook: `.storybook/` and stories in `stories/`.
const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "storybook-nextjs-vite-rsc-")));
const configDir = path.join(root, ".storybook");
fs.mkdirSync(configDir);
fs.writeFileSync(
  path.join(configDir, "main.js"),
  "export default { stories: ['../stories/**/*.stories.tsx'] };\n",
);
fs.writeFileSync(path.join(configDir, "preview.tsx"), "export default {};\n");
afterAll(() => fs.rmSync(root, { recursive: true }));

const presets = (values: Record<string, unknown>) => ({
  apply: async (name: string, fallback?: unknown) => values[name] ?? fallback,
});
const options = (values: Record<string, unknown> = {}) =>
  ({
    configDir,
    presets: presets({ stories: ["../stories/**/*.stories.tsx"], ...values }),
  }) as never;
const viteFinal = (config: object, values?: Record<string, unknown>) =>
  (preset.viteFinal as (config: object, options: never) => Promise<{ plugins: Plugin[] }>)(
    { root, ...config },
    options(values),
  );

test("Storybook's Vite builder and React renderer, with Vite's app builder", async () => {
  expect(preset.core).toEqual({
    builder: import.meta.resolve("@storybook/builder-vite"),
    renderer: import.meta.resolve("@storybook/react/preset"),
  });
  const features = preset.features as (existing: object) => Promise<object>;
  expect(await features({ other: true })).toEqual({ other: true, viteAppBuilder: true });
});

test("the store loads each file through load.ts, next to the preset", () => {
  expect(preset.experimental_moduleLoader).toMatch(
    /storybook-nextjs-vite-rsc\/(src\/load\.ts|dist\/load\.js)$/,
  );
});

test("React by its name, which each layer resolves with its own conditions", async () => {
  expect(await preset.resolvedReact({ mdx: "/mdx" })).toEqual({
    mdx: "/mdx",
    react: "react",
    reactDom: "react-dom",
  });
});

test('an MDX file compiles with "use client" first', async () => {
  const other = () => () => {};
  const { mdxCompileOptions } = await preset.mdxLoaderOptions({
    mdxCompileOptions: { recmaPlugins: [other] },
  });
  const [first, useClient] = mdxCompileOptions.recmaPlugins as (() => (program: object) => void)[];
  expect(first).toBe(other);
  const program = { body: [{ type: "ImportDeclaration" }] };
  useClient!()(program);
  expect(program.body).toEqual([
    {
      type: "ExpressionStatement",
      expression: { type: "Literal", value: "use client" },
      directive: "use client",
    },
    { type: "ImportDeclaration" },
  ]);
});

test("the working directory from the root, for the story files' stylesheets", async () => {
  const env = preset.env as (existing: object, options: never) => Promise<object>;
  expect(await env({ OTHER: "1" }, { configDir } as never)).toEqual({
    OTHER: "1",
    STORYBOOK_NEXTJS_RSC_WORKING_DIR: path.posix.relative(root, process.cwd()),
  });
});

test("the plugin, with Storybook as its host", async () => {
  vitestPluginNext.mockClear();
  const previewAnnotations = [
    { bare: "@storybook/addon-a11y/preview", absolute: "/a11y/preview.js" },
    { bare: "@storybook/react/entry-preview", absolute: "/react/entry-preview.js" },
    "/project/annotations.js",
  ];
  await viteFinal(
    {},
    { frameworkOptions: { build: "production", browserModules: ["msw/**"] }, previewAnnotations },
  );
  const [{ host, build, browserModules }] = vitestPluginNext.mock.calls[0] as [
    {
      host: { files: (string | RegExp)[]; packages: string[] };
      build: string;
      browserModules: string[];
    },
  ];
  expect({ build, browserModules }).toEqual({ build: "production", browserModules: ["msw/**"] });
  // The stories and `.storybook`, relative to the root.
  expect(host.files.slice(0, 2)).toEqual(["stories/**/*.stories.tsx", ".storybook/**"]);
  // The framework's own files, next to the preset.
  const server = fileURLToPath(
    new URL("./server.ts", import.meta.resolve("@storybook/nextjs-vite-rsc/preset")),
  );
  expect((host.files[2] as RegExp).test(server)).toBe(true);
  // Storybook's preview runtime and the previews of the addons, not the
  // renderer's, which render with React.
  expect(host.packages).toEqual(
    expect.arrayContaining([
      "storybook/test",
      "storybook/preview-api",
      "storybook/internal/channels",
      "storybook/internal/csf",
      "storybook/internal/instrumenter",
      "storybook/open-service",
      "@storybook/addon-a11y/preview",
    ]),
  );
  expect(host.packages.filter((name) => name.startsWith("@storybook/react"))).toEqual([]);
  expect(host.packages.filter((name) => name.startsWith("/"))).toEqual([]);
});

test("a Vite config of the project that has the plugin already is an error", async () => {
  // The plugin as a project adds it, so that the check holds its name.
  await expect(viteFinal({ plugins: [vitestPluginRSC()] })).rejects.toThrow(
    "viteConfigPath: '.storybook/vite.config.ts'",
  );
});
