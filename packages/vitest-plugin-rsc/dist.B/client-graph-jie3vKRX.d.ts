//#region src/nextjs/client-graph.d.ts
/**
 * Evaluates a file of the host with `"use client"` in the module graph of
 * the browser layer: the file with the reference key `key`, which with a dev
 * server is its URL in that layer. The module of the rsc layer for the file
 * calls this before its own code runs, as Vitest evaluates what a file
 * imports before it. So a test file with the directive registers its tests
 * with Vitest, which imports the file in the rsc layer, and a setup file
 * with it its hooks.
 *
 * Once for each version of the file, as the browser evaluates a module
 * once: a second import of the file gets the evaluation of the first, or
 * its error. A change of the file, or of a module that it imports, is a new
 * version of it, which evaluates the file again, and so is
 * `forgetClientFiles()`, which the plugin's setup file calls before every
 * test file, as Vitest evaluates a setup file and a test file again for
 * each. What the file imports, once for the graph until it changes, as the
 * browser does for what Vitest evaluates in the tab.
 */
declare function loadClientFile(key: string): Promise<void>;
/**
 * The module that the host imported, as the host uses it. For a file of the
 * host with `"use client"`, which the rsc layer has as a client reference
 * module, the file's own exports from the browser layer: the evaluation the
 * graph has when the host first asks for the module, the one that the
 * module's line loaded unless the graph evaluated the file again since. The
 * same object for the same module, every time. Such a module has the export
 * `clientFileKeyExport`, which the plugin put in front of it, and that alone
 * tells it: other exports, like one that a plugin of the host adds, change
 * nothing. Any other module as it is. Links nothing: a host that uses the
 * file links its stylesheets with `linkStylesheetsOf()`.
 *
 * Rejects for the client reference module of a file that is not the host's,
 * which nothing evaluated in the browser layer.
 */
declare function loadClientModule<T extends object>(module: T): Promise<T>;
/**
 * Links the stylesheets of files of the host that the host uses, like a
 * framework that renders a component of one, or one that renders as it
 * loads: what each imports, in the browser layer for a file with
 * `"use client"`, in their order, as they are now. The files as for
 * `hostFiles` of `renderServer()`: absolute, or from the root of the
 * project. Resolves once the stylesheets have loaded.
 *
 * The use ends as `signal` aborts, and without one at `cleanup()`, which ends
 * every use: a stylesheet goes once no use holds it. An aborted signal links
 * nothing, and a use whose signal aborts rejects at once with the signal's
 * reason, as `renderServer()` does: also while it asks for the stylesheets,
 * whose answer then links nothing.
 */
declare function linkStylesheetsOf(hostFiles: string[], {
  signal
}?: {
  signal?: AbortSignal;
}): Promise<void>;
//#endregion
export { loadClientFile as n, loadClientModule as r, linkStylesheetsOf as t };