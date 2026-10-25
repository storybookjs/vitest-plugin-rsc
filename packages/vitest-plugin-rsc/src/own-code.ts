import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// The plugin's own code, as a key of a cache of what it compiles: the
// optimizer's pre-bundles (nextjs/optimizer-cache-key.ts) and Vitest's
// transform cache (index.ts). A cache keyed on the version of the package
// alone would keep what an older compile made, in this repository, where the
// version stays as the code changes.

// A file of the plugin's code: not a test, nor a declaration of types.
const isCode = (file: string) =>
  /\.[cm]?[jt]sx?$/.test(file) &&
  !/\.test\.[cm]?[jt]sx?$/.test(file) &&
  !/\.d\.[cm]?ts$/.test(file);

/**
 * The code of a directory of the plugin: the contents of every file of it.
 * The contents, not the version, which a build of this repository keeps, and
 * not the times of the files, which every build changes. All of the code,
 * not just the modules that compile a dependency: a bundle of `dist` mixes
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

// The directories of the plugin's code: `src`, which runs in this repository
// (the `vitest-plugin-rsc-source` condition), and `dist`, which runs where the
// package is installed, and which the source runs the modules of Node.js of
// (node-builtins.ts). Both where both are there, so that a build, which
// writes the same files again for the same source, keeps the key. None where
// the code is not in its package, bundled into another file: then the
// lockfile, which Vite and Vitest hash too, has its version.
function ownCodeDirs(): string[] {
  const file = fileURLToPath(import.meta.url);
  for (let dir = path.dirname(file); dir !== path.dirname(dir); dir = path.dirname(dir)) {
    const manifest = path.join(dir, "package.json");
    if (!fs.existsSync(manifest)) continue;
    const { name } = JSON.parse(fs.readFileSync(manifest, "utf8")) as { name?: string };
    if (name !== "vitest-plugin-rsc") return [];
    return ["src", "dist"]
      .map((code) => path.join(dir, code))
      .filter((code) => fs.statSync(code, { throwIfNoEntry: false })?.isDirectory());
  }
  return [];
}

let key: string | undefined;

/** The key of the plugin's code, once for the process. */
export function ownCodeKey(): string {
  if (key === undefined) {
    // The key only renews a cache: a file that cannot be read, like one that
    // a build is writing, leaves it to the version in the lockfile, as
    // without it.
    try {
      key = createHash("sha256")
        .update(
          ownCodeDirs()
            .map((dir) => `${path.basename(dir)}:${codeKey(dir)}`)
            .join(","),
        )
        .digest("hex")
        .slice(0, 16);
    } catch {
      key = "";
    }
  }
  return key;
}
