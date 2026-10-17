// What the code that the plugin generates imports, by the path of this file,
// which is an entry of the build for that. Not an export of the package, and
// not public API: it changes with the plugin.

/**
 * @internal Loads a file of the host with `"use client"` in the browser
 * layer: the module of the rsc layer for the file calls it. See
 * client-graph.ts.
 */
export { loadClientFile } from "./client-graph.ts";

import { registry } from "./registry.ts";

/**
 * @internal A file of the host says so as it loads in the rsc layer: the
 * plugin puts the call in front of the file. See `hostFiles` in registry.ts.
 */
export function loadedHostFile(file: string): void {
  if (!registry.hostFiles.includes(file)) registry.hostFiles.push(file);
}
