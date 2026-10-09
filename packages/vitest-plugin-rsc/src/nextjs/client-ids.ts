// What a module of the browser layer is known by, to the server that serves
// the layers and to the browser that runs them.

/** What a Flight payload refers to client-node.tsx by. */
export const clientNodeReference = "/@id/vitest-plugin-rsc/nextjs/client-node";

// A dev server gives a module of JavaScript in `node_modules` that it does not
// pre-bundle the version of the dependencies, in the query of its id, by which
// a browser caches it: `/x/node_modules/a/b.js?v=1a2b3c4d`. A package of the
// host can be such a module, like a framework of Storybook. The version is the one of an
// environment, so another layer has another. Any other query, like `?raw` or
// `?url`, makes another module of the file.
const versionQuery = /^\?v=[\w.-]+$/;

/**
 * The file that a module of Vite is, by its id: the id, without the version
 * a dev server adds for a dependency. Nothing for an id with another query.
 */
export function fileOfModule(id: string): string | undefined {
  const query = id.indexOf("?");
  if (query === -1) return id;
  return versionQuery.test(id.slice(query)) ? id.slice(0, query) : undefined;
}

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

// A static build has a file of the browser layer for every client file of the
// host, and one for every module in between. Its id is the path of the file in
// the build: see build.ts, which builds the layer of this name into this
// directory.
const builtDir = "/vitest-plugin-rsc/react_client/";
/** Where a build has the client files. */
export const builtClientFileDir = `${builtDir}client-files/`;
/** Where a build has the modules in between. */
export const builtLiveModuleDir = `${builtDir}live-modules/`;

/** Whether what a client file imports is such a module. */
export function isLiveModule(url: string): boolean {
  return url.includes(liveModuleUrl) || url.startsWith(builtLiveModuleDir);
}
