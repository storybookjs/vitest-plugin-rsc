import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextLayer, NextProject } from "./project.ts";

// Vite keeps the pre-bundles of a layer while the hash of its config is the
// same (`getConfigHash()` of Vite's optimizer). It hashes the lockfile and
// the options of the optimizer, but of its plugins only their names
// (vitejs/vite#6855): not what they resolve to, not how they compile. The
// plugin's do both, by what the project gives them, the alias tables of the
// layer and the options of Next's transform, and by the plugin's own code, so
// that a change of either would keep the old pre-bundles, and a run would
// test stale code until `--force`. Vite has no hook to add to that hash. So
// the two go into a part of the options it does hash, the `define` of the
// optimizer's bundler, under names no code reads: they change no byte of a
// pre-bundle, and Vite keeps them in its own metadata of the cache.

const hash = (text: string) => createHash("sha256").update(text).digest("hex").slice(0, 16);

type OptimizerInputs = Pick<NextProject, "aliases" | "appAliases" | "dependencyCompileOptions">;

/**
 * What the project gives the optimizer's plugins of a layer: Next's alias
 * table and the app's, which the resolver picks from by the importer, and the
 * options of Next's transform for a dependency. The tables in their order,
 * not sorted: the resolver takes the first entry that matches, and a prefix
 * like `next` can match where a later one would. The order is the code's,
 * the same for every run.
 */
export function projectKey(project: OptimizerInputs, layer: NextLayer): string {
  return hash(
    JSON.stringify([
      Object.entries(project.aliases[layer]),
      Object.entries(project.appAliases[layer]),
      project.dependencyCompileOptions[layer],
    ]),
  );
}

// A file of the plugin's code: not a test, nor a declaration of types.
const isCode = (file: string) =>
  /\.[cm]?[jt]sx?$/.test(file) &&
  !/\.test\.[cm]?[jt]sx?$/.test(file) &&
  !/\.d\.[cm]?ts$/.test(file);

/**
 * The plugin's code: the contents of every file of it, in `src` where the
 * source runs (this repository, with the `vitest-plugin-rsc-source`
 * condition), in `dist` where the package is built. One rule for both: the
 * contents, not the version, which a build of this repository keeps, and not
 * the times of the files, which every build changes. All of the code, not
 * just the modules that compile a dependency: a bundle of `dist` mixes
 * modules, and what those import is just as much the compile.
 */
export function codeKey(dir: string): string {
  const content = createHash("sha256");
  const files = fs
    .readdirSync(dir, { recursive: true, encoding: "utf8" })
    .map((file) => file.split(path.sep).join("/"))
    .filter(isCode)
    .sort();
  for (const file of files) {
    const full = path.join(dir, file);
    if (!fs.statSync(full).isFile()) continue;
    content.update(`${file}\0`).update(fs.readFileSync(full)).update("\0");
  }
  return content.digest("hex").slice(0, 16);
}

// The directory of the package that this code is in, `src` or `dist`: the
// top one of the package, whatever chunk of `dist` this module is bundled in.
// None where the code is not in its package, bundled into another file: the
// lockfile, which Vite hashes, has its version.
function ownCodeDir(): string | undefined {
  const file = fileURLToPath(import.meta.url);
  for (let dir = path.dirname(file); dir !== path.dirname(dir); dir = path.dirname(dir)) {
    const manifest = path.join(dir, "package.json");
    if (!fs.existsSync(manifest)) continue;
    const { name } = JSON.parse(fs.readFileSync(manifest, "utf8")) as { name?: string };
    if (name !== "vitest-plugin-rsc") return;
    return path.join(dir, path.relative(dir, file).split(path.sep)[0]!);
  }
}

let ownCodeKey: string | undefined;

/** For the `define` of the optimizer of a layer, which Vite keys its cache on. */
export function optimizerCacheKey(
  project: OptimizerInputs,
  layer: NextLayer,
): Record<string, string> {
  if (ownCodeKey === undefined) {
    const dir = ownCodeDir();
    ownCodeKey = dir ? codeKey(dir) : "";
  }
  return {
    __vitest_plugin_rsc_project__: JSON.stringify(projectKey(project, layer)),
    __vitest_plugin_rsc_code__: JSON.stringify(ownCodeKey),
  };
}
