import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createProject } from "./host.ts";

// What the tests of a static build of a playground share: `vite build` of the
// project, the files of the build, and a copy of the project to build in
// another directory.

/** Builds the project in `dir` into `outDir` with `vite build`. */
export const viteBuild = (dir: string, outDir: string, env: Record<string, string> = {}) =>
  createProject(dir, { env }).run(
    "vite",
    "build",
    "--configLoader",
    "native",
    "--outDir",
    outDir,
    "--emptyOutDir",
  );

/** The files of a directory, by their paths from it, with `/`, in order. */
export const filesOf = (dir: string) =>
  fs
    .readdirSync(dir, { recursive: true, encoding: "utf8" })
    .filter((file) => fs.statSync(path.join(dir, file)).isFile())
    .map((file) => file.split(path.sep).join("/"))
    .sort();

/** Every file of a directory with a hash of its content. */
export const hashesOf = (dir: string) =>
  Object.fromEntries(
    filesOf(dir).map((file) => [
      file,
      createHash("sha256")
        .update(fs.readFileSync(path.join(dir, file)))
        .digest("hex"),
    ]),
  );

/**
 * The files of a build that name a directory of the machine that built it:
 * the repository, which the project is in, or the home directory. As it is
 * written, with `/`, and escaped in a string, each with a separator after it.
 * Not a directory at the root, like `/app` in a container: its name is in
 * many a URL.
 */
export function filesWithMachinePaths(dir: string, repository: string): Record<string, string[]> {
  const named = [...new Set([repository, fs.realpathSync(repository), os.homedir()])].flatMap(
    (name) =>
      path.dirname(name) === path.parse(name).root
        ? []
        : [
            ...new Set([
              name + path.sep,
              `${name.split(path.sep).join("/")}/`,
              JSON.stringify(name + path.sep).slice(1, -1),
            ]),
          ],
  );
  const found: Record<string, string[]> = {};
  for (const file of filesOf(dir)) {
    const content = fs.readFileSync(path.join(dir, file));
    const names = named.filter((name) => content.includes(name));
    if (names.length > 0) found[file] = names;
  }
  return found;
}

/**
 * A copy of the project in `root`, in a directory next to it, which
 * `vite build` builds like the project itself. Its `node_modules` links to
 * the same packages, by the same way up: what the build names by the way from
 * the root of the project is the same. Not what test runs write into the
 * project: a build, Next's cache in `.next`, the apps of a test in `.app-*`.
 */
export function copyProject(root: string, copy: string): void {
  const skipped =
    /^(?:dist|\.next|\.app-[^\\/]*|\.vitest[^\\/]*|node_modules[\\/]\.(?!bin(?:[\\/]|$))[^\\/]*)(?:[\\/]|$)/;
  fs.cpSync(root, copy, {
    recursive: true,
    verbatimSymlinks: true,
    filter: (source) => !skipped.test(path.relative(root, source)),
  });
}
