// A module of the page itself, for code that a module runner evaluates. A
// runner has a module graph of its own, so what it imports is a copy. Some
// modules have to be the one instance the page already has: the packages of
// the test runner, whose `test()` collects for the file that is being
// imported, the packages of another host (`host.packages` in
// nextjs/server-code.ts), and a file of the host without `"use client"`,
// which is evaluated once, by the page (nextjs/client-files.ts). A file of
// the host is a test file or a setup file, or a file of another host, which
// the host runs.
//
// The server resolves such an import to an id with this prefix. The transport
// of a runner answers it without asking the server: it is an external module,
// which the runner imports the way the page does, with `import()`. The server
// then serves the page a module with the namespace of the module it stands
// for as its default export, which the runner unwraps (see
// `runExternalModule` in utils.ts): one shape for every such module, also
// one with an export the page's version has not, like the testing library's
// `renderServer()` that throws.

export const hostModulePrefix = "\0vitest-plugin-rsc/host-module/";

// How Vite spells that id where a URL is expected.
const hostModuleUrl = "/@id/__x00__vitest-plugin-rsc/host-module/";

/** Whether what a runner asks for is a module of the page. */
export function isHostModule(url: string): boolean {
  return url.includes(hostModuleUrl);
}

// A static build has no server that serves that module to the page. The page's
// own instance is in the host's build, the rsc layer, which the host's
// scripts are one bundle with. So a layer of the module runner imports it by
// the URL a dev server has for it, as an external module, and the rsc layer
// has a list of them, which imports each one as the host's build has it:
// see `hostModulesId` in static-build.ts.

/**
 * The URL by which a built layer of the module runner imports a module of
 * the page, by the import it stands for: `host-report` or `storybook/test`,
 * or a file of the host, `/host/shared.ts?host-file` (see
 * `hostFileSpecifier()` in nextjs/client-files.ts).
 */
export const builtHostModuleUrl = (specifier: string): string => hostModuleUrl + specifier;

/**
 * For the rsc layer: in a static build, how to load the module of the page
 * that each URL of `builtHostModuleUrl()` stands for. Nothing with a dev
 * server.
 */
export const hostModulesId = "virtual:vitest-plugin-rsc/host-modules";

/** The import that a URL of `builtHostModuleUrl()` stands for. */
export const hostModuleSpecifier = (url: string): string =>
  url.slice(url.indexOf(hostModuleUrl) + hostModuleUrl.length);
