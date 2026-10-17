// A module of the page itself, for code that a module runner evaluates. A
// runner has a module graph of its own, so what it imports is a copy. Some
// modules have to be the one instance the page already has: the packages of
// the test runner, whose `test()` collects for the file that is being
// imported, and the packages of another host (`host.packages` in
// nextjs/server-code.ts). (A "host file" is something else: a test file or a
// setup file, or a file of another host, which the host runs.)
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
