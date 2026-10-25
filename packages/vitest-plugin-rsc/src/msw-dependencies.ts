import fs from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";

// What MSW imports in the page, for the optimizer of the page to bundle from
// the start. Vitest's Browser Mode keeps `msw` and `msw/browser` out of the
// optimizer, which then serves their files as they are: its scan does not
// look into them, and Vite finds what they import only as the page loads
// them, a module deeper at a time. A dependency found after the first
// bundling has Vite bundle again and reload the page, which then has no
// runner for its tests. So where the page is in a browser and the optimizer
// of `client`, where the tests and their setup run, excludes MSW, the plugin
// names MSW's dependencies to it as `msw > <dependency>`, as an app would.
// Not for a page in a worker of Node.js: a project that excludes MSW there
// has Node.js import it, and its dependencies, itself.
export function mswDependenciesPlugin(page: { inNode: boolean }): Plugin {
  return {
    name: "rsc:msw-dependencies",
    // Vitest gives `client` its excludes once the config is resolved, and
    // the optimizers start on listen, after this.
    configureServer(server) {
      if (page.inNode) return;
      const { optimizeDeps } = server.config.environments.client!;
      if (!optimizeDeps.exclude?.some((id) => id === "msw" || id === "msw/browser")) return;
      const dependencies = mswDependencies(server.config.root);
      if (dependencies.length === 0) return;
      optimizeDeps.include = [...new Set([...(optimizeDeps.include ?? []), ...dependencies])];
    },
  };
}

type Exports = string | null | { [condition: string]: Exports };
type Manifest = {
  exports?: Record<string, Exports>;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
};

// A static or dynamic import of an ES module as a bundler writes it, like
// MSW's own build: `from "x"`, `import "x"` and `import("x")`.
const importPattern = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(["'])([^"'\n]+)\1/g;

/**
 * The bare imports of what `msw` and `msw/browser` load in a browser, the
 * modules of MSW that the optimizer leaves out, each as `msw > <import>`: by
 * the modules of the MSW the project has, so for its version. Only the ones
 * of a package that MSW depends on: not a module of Node.js, nor a word in a
 * string that looks like an import. None without MSW.
 */
export function mswDependencies(root: string): string[] {
  const manifestFile = mswManifestOf(root);
  if (!manifestFile) return [];
  const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8")) as Manifest;
  const dir = path.dirname(manifestFile);
  const declared = new Set(
    Object.keys({
      ...manifest.dependencies,
      ...manifest.peerDependencies,
      ...manifest.optionalDependencies,
    }),
  );
  const queue = [".", "./browser"]
    .map((entry) => browserFile(manifest.exports?.[entry]))
    .filter((file) => file !== undefined)
    .map((file) => path.join(dir, file));
  const seen = new Set<string>();
  const found = new Set<string>();
  for (let file = queue.pop(); file !== undefined; file = queue.pop()) {
    if (seen.has(file)) continue;
    seen.add(file);
    for (const [, , specifier] of fs.readFileSync(file, "utf8").matchAll(importPattern)) {
      if (specifier!.startsWith(".")) queue.push(path.resolve(path.dirname(file), specifier!));
      else if (declared.has(packageOf(specifier!))) found.add(specifier!);
    }
  }
  return [...found].sort().map((specifier) => `msw > ${specifier}`);
}

// MSW's `package.json` where Vite finds `msw` for the project: in a
// `node_modules` of its root or of a folder above it. Not by Node's
// `require.resolve()`, which also looks in the folders of `NODE_PATH`, where
// pnpm puts every package it installed.
function mswManifestOf(root: string): string | undefined {
  for (let dir = path.resolve(root); ; dir = path.dirname(dir)) {
    const file = path.join(dir, "node_modules", "msw", "package.json");
    if (fs.existsSync(file)) return file;
    if (path.dirname(dir) === dir) return undefined;
  }
}

// The file of an entry of `exports` under a browser's conditions.
function browserFile(entry: Exports | undefined): string | undefined {
  if (typeof entry === "string") return entry;
  if (!entry) return undefined;
  for (const condition of ["browser", "import", "default"]) {
    if (condition in entry) return browserFile(entry[condition]);
  }
  return undefined;
}

function packageOf(specifier: string): string {
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0]!;
}
