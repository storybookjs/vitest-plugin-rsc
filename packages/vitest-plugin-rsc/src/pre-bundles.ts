import fs from "node:fs";
import path from "node:path";
import type { DevEnvironment } from "vite";

// Which pre-bundles of an environment's optimizer a module that imports one
// was compiled against, for the key of Vitest's cache on disk of a page in a
// worker of Node.js (index.ts). The URL of a pre-bundle has their version.
//
// The key of a module is made once in a run: a module that imports a
// pre-bundle that the optimizer bundles again mid-run, as it finds a
// dependency, keeps the old version in its URL until the next run. Nor is
// the version enough. It is a hash of what they bundle, so a run whose
// optimizer bundles from its scan again, as after `node_modules/.vite` is
// removed or the `build` option changed, has the version an earlier run had
// before it found a dependency as a test ran. A module that run compiled as
// it found it imports the pre-bundle of that dependency, which this run's
// optimizer has not, and would not find either: Vitest's runner would ask
// for a pre-bundle that is never there, and the test file fails, run after
// run. So also when the optimizer wrote them, once for each version. And
// their directory, which is the project's: two projects with the same
// optimizer's config have the same version, but each its own URLs.

const writtenAt = new WeakMap<object, number>();

/** The pre-bundles of an environment: their directory, version and when they were written. */
export function preBundlesOf(environment: DevEnvironment): string {
  const optimizer = environment.depsOptimizer;
  const version = optimizer?.metadata.browserHash ?? "";
  return `${environment.config.cacheDir}:${version}:${optimizer ? writtenAtOf(optimizer.metadata) : ""}`;
}

// By Vite's file of what the directory of the pre-bundles has, which the
// optimizer writes with them: a new object of it each time.
function writtenAtOf(metadata: NonNullable<DevEnvironment["depsOptimizer"]>["metadata"]): number {
  let time = writtenAt.get(metadata);
  if (time === undefined) {
    const file = Object.values(metadata.optimized)[0]?.file;
    const stat =
      file &&
      fs.statSync(path.join(path.dirname(file), "_metadata.json"), { throwIfNoEntry: false });
    time = stat ? stat.mtimeMs : 0;
    writtenAt.set(metadata, time);
  }
  return time;
}
