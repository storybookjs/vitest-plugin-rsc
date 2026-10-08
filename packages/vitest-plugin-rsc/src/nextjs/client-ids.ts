// What a module of the browser layer is known by, to the server that serves
// the layers and to the browser that runs them.

/** What a Flight payload refers to client-node.tsx by. */
export const clientNodeReference = "/@id/vitest-plugin-rsc/nextjs/client-node";

/**
 * What the browser layer imports a file with `"use client"` of the host by: a
 * test file, a story. `file` is its path, with forward slashes.
 */
export function clientFileId(file: string): string {
  return `/@fs/${file.replace(/^\/+/, "")}`;
}

/**
 * What such a file imports in the browser layer: a module that has the
 * namespace of the import as its one export, `module`. The id names the file
 * and what it imports. See client-files.ts.
 */
export const liveModulePrefix = "\0vitest-plugin-rsc/live-module/";

// How Vite spells that id where a URL is expected.
const liveModuleUrl = "/@id/__x00__vitest-plugin-rsc/live-module/";

/** Whether what a client file imports is such a module. */
export function isLiveModule(url: string): boolean {
  return url.includes(liveModuleUrl);
}
