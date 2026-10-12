// `vitest-plugin-rsc/nextjs/internal`: not public API. What the code the
// plugin generates needs. It changes with the plugin.

/**
 * @internal Loads a file with `"use client"` in the browser layer: the
 * module of the rsc layer for such a file calls it. See client-graph.ts.
 */
export { loadClientFile } from "./client-graph.ts";
