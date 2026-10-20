// The server's disk, memfs, which the package's `node:fs` (src/node/fs.ts)
// makes when it first loads. It is on a global of its own, not in
// `registry`: a module of the host can import `fs` before any module of the
// plugin has loaded. Both server layers and the test files have their copy of
// that module, and they share the disk. Nothing here imports memfs: the test
// files import this for `resetDisk()`, and only a layer that imports `fs`
// has memfs.

/** The global the disk is on. */
export const diskGlobal = "__vitest_plugin_rsc_disk__";

/** The disk: the `fs` of memfs, and what empties it. */
export type Disk = { fs: Record<string, any>; reset(): void };

/**
 * Empties the disk, as it is before any test: nothing but `/tmp`, which
 * `os.tmpdir()` names. Closes what watches a file of it, which would see the
 * next test's files otherwise. Nothing to do while no module imports `fs`.
 */
export function resetDisk(): void {
  (globalThis as { [diskGlobal]?: Disk })[diskGlobal]?.reset();
}
