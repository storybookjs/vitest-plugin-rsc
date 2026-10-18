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
  vitestPluginNext: vi.fn((_options: object): Plugin[] => []),
}));
vi.mock("vitest-plugin-rsc/nextjs/plugin", () => ({ vitestPluginNext }));

// A project with a Storybook: `.storybook/` and stories in `stories/`.
const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "storybook-nextjs-vite-rsc-")));
const configDir = path.join(root, ".storybook");
fs.mkdirSync(configDir);
fs.writeFileSync(
  path.join(configDir, "main.js"),
  "export default { stories: ['../stories/**/*.stories.tsx'], addons: ['@storybook/addon-a11y', './local-addon.js'] };\n",
);
fs.writeFileSync(path.join(configDir, "preview.tsx"), "export default {};\n");
afterAll(() => fs.rmSync(root, { recursive: true }));

const presets = (values: Record<string, unknown>) => ({
  apply: async (name: string) => values[name],
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

test("the preview of the framework in place of the annotations of @storybook/react that render", async () => {
  const react = (entry: string) => fileURLToPath(import.meta.resolve(`@storybook/react/${entry}`));
  const annotations = preset.previewAnnotations as (input: unknown[]) => Promise<unknown[]>;
  // What the renderer's preset gave, which Storybook applies before the
  // framework's, and the addons' and the project's after it.
  const argtypes = {
    bare: "@storybook/react/entry-preview-argtypes",
    absolute: react("entry-preview-argtypes"),
  };
  const result = await annotations([react("entry-preview"), react("entry-preview-docs"), argtypes]);
  expect(result[0]).toEqual(argtypes);
  // Next to the preset, in `src` or `dist`.
  expect(result[1]).toMatch(/storybook-nextjs-vite-rsc\/(src\/preview\.ts|dist\/preview\.js)$/);
  expect(result).toHaveLength(2);
});

test("the plugin, with the stories and .storybook as files of the host", async () => {
  vitestPluginNext.mockClear();
  await viteFinal({}, { frameworkOptions: { build: "production", browserModules: ["msw/**"] } });
  const [{ host, build, browserModules }] = vitestPluginNext.mock.calls[0] as [
    {
      host: { files: (string | RegExp)[]; packages: string[] };
      build: string;
      browserModules: string[];
    },
  ];
  expect({ build, browserModules }).toEqual({ build: "production", browserModules: ["msw/**"] });
  // Relative to the root.
  expect(host.files.slice(0, 2)).toEqual(["stories/**/*.stories.tsx", ".storybook/**"]);
  // The framework's own files: the canvas, next to the preset.
  const canvas = fileURLToPath(
    new URL("./client-canvas.tsx", import.meta.resolve("@storybook/nextjs-vite-rsc/preset")),
  );
  expect((host.files[2] as RegExp).test(canvas)).toBe(true);
  // Not a local addon, and not @storybook/react, whose renderer the browser
  // layer has a copy of.
  expect(host.packages).toEqual(["storybook", "@storybook/addon-a11y"]);
});

test("the virtual module of the project has the preview file, from the root", async () => {
  const { plugins } = await viteFinal({});
  const project = plugins.find((plugin) => plugin.name === "storybook-nextjs-vite-rsc:project")!;
  const id = (project.resolveId as (source: string) => string)(
    "virtual:@storybook/nextjs-vite-rsc/project",
  );
  const code = (project.load as (id: string) => string)(id);
  expect(code).toContain(`from ${JSON.stringify(path.join(configDir, "preview.tsx"))};`);
  expect(code).toContain('export const previewFile = ".storybook/preview.tsx";');
});

test("a Vite config of the project that has the plugin already is an error", async () => {
  // The plugin as a project adds it, so that the check holds its name.
  await expect(viteFinal({ plugins: [vitestPluginRSC()] })).rejects.toThrow(
    "viteConfigPath: '.storybook/vite.config.ts'",
  );
});
