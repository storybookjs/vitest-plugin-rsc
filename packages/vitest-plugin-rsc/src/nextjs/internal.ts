// What the code that the plugin generates imports, by the path of this file,
// which is an entry of the build for that. Not an export of the package, and
// not public API: it changes with the plugin.

/**
 * @internal Loads a file with `"use client"` in the browser layer: the
 * module of the rsc layer for such a file calls it. See client-graph.ts.
 */
export { loadClientFile } from "./client-graph.ts";
