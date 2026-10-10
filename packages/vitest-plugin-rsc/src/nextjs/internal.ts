import { registry } from "./registry.ts";

// `vitest-plugin-rsc/nextjs/internal`: not public API. What the code the
// plugin generates and the Storybook framework of the playground need. It
// changes with the plugin.

/**
 * @internal Loads a file with `"use client"` in the browser layer: the
 * module of the rsc layer for such a file calls it. See client-graph.ts.
 */
export { loadClientFile, unloadClientFile } from "./client-graph.ts";

/**
 * @internal The file with `"use client"` of the host that an export is of,
 * and its name there: what `clientNode()` takes. The module is what the
 * browser layer imports the file by. Nothing for a value of another module.
 */
export function clientFileOf(value: unknown): { module: string; name: string } | undefined {
  const isObject = (typeof value === "object" && value !== null) || typeof value === "function";
  return isObject ? registry.clientExports.get(value) : undefined;
}
