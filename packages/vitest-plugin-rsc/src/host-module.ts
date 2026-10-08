// A module of the page itself, for code that a module runner evaluates. A
// runner has a module graph of its own, so what it imports is a copy. Some
// modules have to be the one instance the page already has: the test runner,
// whose `test()` collects for the file that is being imported, or the spies of
// Storybook, which its panels listen to.
//
// The server resolves such an import to an id with this prefix. The transport
// of a runner answers it without asking the server: it is an external module,
// which the runner imports the way the page does, with `import()`. The server
// then serves the page a module with the namespace of the module it stands
// for as its default export. Not a re-export: a host can have its own way to
// compile an import of its packages, as Storybook has, and `export * from` is
// not what that expects.
//
// A static build has no server to ask. The page's modules are in the build of
// the host, which has a list of the ones the runners import, by the same URL:
// see nextjs/build.ts.

export const hostModulePrefix = "\0vitest-plugin-rsc/host-module/";

/** How Vite spells that id where a URL is expected. */
export const hostModuleUrl = "/@id/__x00__vitest-plugin-rsc/host-module/";

/** Whether what a runner asks for is a module of the page. */
export function isHostModule(url: string): boolean {
  return url.includes(hostModuleUrl);
}
