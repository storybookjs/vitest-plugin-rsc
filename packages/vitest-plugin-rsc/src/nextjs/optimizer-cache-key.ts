import { createHash } from "node:crypto";
import { ownCodeKey } from "../own-code.ts";
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
// pre-bundle, and Vite keeps their hash in its own metadata of the cache.

const hash = (text: string) => createHash("sha256").update(text).digest("hex").slice(0, 16);

type OptimizerInputs = Pick<
  NextProject,
  "aliases" | "appAliases" | "dependencyCompileOptions" | "newExports" | "version"
>;

/**
 * What the project gives the optimizer's plugins of a layer: Next's alias
 * table and the app's, which the resolver picks from by the importer, and the
 * options of Next's transform for a dependency. The tables in their order,
 * not sorted: the resolver takes the first entry that matches, and a prefix
 * like `next` can match where a later one would. The order is the code's,
 * the same for every run. And the stubs of the stand-ins, of the version of
 * Next.
 */
export function projectKey(project: OptimizerInputs, layer: NextLayer): string {
  return hash(
    JSON.stringify([
      Object.entries(project.aliases[layer]),
      Object.entries(project.appAliases[layer]),
      project.dependencyCompileOptions[layer],
      // The stubs that the stand-ins of node-platform.ts get, for the exports
      // of the installed Next that they have not, which a Next changed by
      // hand has without a change of the lockfile.
      project.newExports,
      project.version,
    ]),
  );
}

/** For the `define` of the optimizer of a layer, which Vite keys its cache on. */
export function optimizerCacheKey(
  project: OptimizerInputs,
  layer: NextLayer,
): Record<string, string> {
  return {
    __vitest_plugin_rsc_project__: JSON.stringify(projectKey(project, layer)),
    __vitest_plugin_rsc_code__: JSON.stringify(ownCodeKey()),
  };
}
