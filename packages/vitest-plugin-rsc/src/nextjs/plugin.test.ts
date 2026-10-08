import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizePath } from "vite";
import { expect, test } from "vitest";
import { vitestPluginNext } from "./plugin.ts";

// What the plugin has Vite scan and pre-bundle for the demo, per layer. A
// dependency that is missing here is one Vite finds while a test runs, with a
// cold cache: it pre-bundles again and reloads the page.

const here = fileURLToPath(new URL("./", import.meta.url));
const root = fileURLToPath(new URL("../../../../playground/nextjs-e2e-demo", import.meta.url));
const installed = createRequire(path.join(root, "package.json"));
const nextDir = path.dirname(installed.resolve("next/package.json"));

type OptimizeDeps = { entries?: string[]; include: string[] };
type Config = { environments: Record<string, { optimizeDeps: OptimizeDeps }> };

// The config loads the project, and Next's config with it: once for the file.
const optimizeDeps = (async () => {
  const plugin = vitestPluginNext().find(({ name }) => name === "vitest-plugin-rsc:next")!;
  const { environments } = await (plugin.config as (config: object) => Promise<Config>)({ root });
  return {
    rsc: environments.client!.optimizeDeps,
    ssr: environments.next_ssr!.optimizeDeps,
    browser: environments.react_client!.optimizeDeps,
  };
})();

test("has Vite scan the proxy of the app, next to its routes", async () => {
  const { rsc } = await optimizeDeps;

  // No file of `app/` imports the proxy, so the scan of `app/` does not find
  // what only the proxy imports.
  expect(rsc.entries).toEqual([
    normalizePath(path.join(root, "app/**/*.{js,jsx,ts,tsx}")),
    normalizePath(path.join(root, "proxy.ts")),
  ]);
});

test("pre-bundles every Client Component of Next for the layers that render one", async () => {
  const { rsc, ssr, browser } = await optimizeDeps;

  // A Flight payload names a Client Component of Next by its file. The app
  // imports this one as `next/legacy/image`, which is all the scan finds.
  const legacyImage = "next/dist/esm/client/legacy/image.js";
  expect(ssr.include).toContain(legacyImage);
  expect(browser.include).toContain(legacyImage);
  // The rsc layer has a reference to it, in whatever imports it.
  expect(rsc.include).not.toContain(legacyImage);

  // Every file that the rsc layer makes a client reference of.
  const boundaries = fs
    .readdirSync(path.join(nextDir, "dist/esm"), { recursive: true, encoding: "utf8" })
    .filter((file) => {
      if (!file.endsWith(".js")) return false;
      return /^\s*(["'])use client\1/.test(
        fs.readFileSync(path.join(nextDir, "dist/esm", file), "utf8"),
      );
    })
    .map((file) => `next/dist/esm/${normalizePath(file)}`);
  expect(boundaries.length).toBeGreaterThan(20);
  expect(ssr.include).toEqual(expect.arrayContaining(boundaries));
  expect(browser.include).toEqual(expect.arrayContaining(boundaries));
});

// The modules of this package that run in a layer in the browser and import a
// module of Next: the entry of the layer, and what it imports from here.
const runtimeFiles = {
  ssr: ["ssr.ts", "cache.ts", "node-server.ts"],
  browser: ["client.tsx"],
} as const;

// The modules of Next that a file imports to run, not only for their types.
function nextImportsOf(file: string): string[] {
  const code = fs.readFileSync(path.join(here, file), "utf8");
  return [
    ...code.matchAll(/^import (?!type\b)[^;]*?from "(next\/[^"]+)";/gms),
    ...code.matchAll(/\bimport\("(next\/[^"]+)"\)/g),
  ].map((match) => match[1]!);
}

// The file of Next's ESM build that the plugin pre-bundles for a specifier.
function preBundledAs(specifier: string): string {
  const file = path.relative(nextDir, installed.resolve(specifier));
  return `next/${normalizePath(file).replace(/^dist\/(?!compiled\/|esm\/)/, "dist/esm/")}`;
}

test("pre-bundles every module of Next that a module of the plugin imports in the browser", async () => {
  const deps = await optimizeDeps;

  for (const [layer, files] of Object.entries(runtimeFiles)) {
    const imported = files.flatMap(nextImportsOf);
    expect(imported.length).toBeGreaterThan(0);
    // A new import is to be listed in `runtimeImports` of plugin.ts.
    expect(deps[layer as keyof typeof runtimeFiles].include).toEqual(
      expect.arrayContaining(imported.map(preBundledAs)),
    );
  }
});
