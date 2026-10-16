// What the code that the plugin generates imports, by the path of this file,
// which is an entry of the build for that. Not an export of the package, and
// not public API: it changes with the plugin.

/**
 * @internal Loads in the browser layer what a file of the host loads there:
 * the module of the rsc layer for a setup file, or for a file with
 * `"use client"`, calls it. See client-graph.ts.
 */
export { loadClientEntry } from "./client-graph.ts";
