// What the code that the plugin generates imports, by the path of this file,
// which is an entry of the build for that. Not an export of the package, and
// not public API: it changes with the plugin.

// The server's platform, which loading a file reads, as `registry.network`
// in a build: a module of the host can import a file with `"use client"`
// before anything else of the plugin.
import "./globals.ts";

/**
 * @internal Loads a file of the host with `"use client"` in the browser
 * layer: the module of the rsc layer for the file calls it. See
 * client-graph.ts.
 */
export { loadClientFile } from "./client-graph.ts";
