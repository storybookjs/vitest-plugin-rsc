// What the page and the dev server share about the routes a test file opens,
// which the dev server compiles ahead of the file's first page load, and the
// modules the page loads natively, which it preloads: see routes-ahead.ts.

/**
 * Where the page tells the dev server of a test file that starts in it, and
 * of a route it opened, over the websocket of the page (`askDevServer()` in
 * ../utils.ts), with a `RoutesAheadNews`.
 */
export const routesAheadEvent = "vitest-plugin-rsc:next-routes-ahead";

/**
 * A test file that starts in a tab, or a route that one opened, by the name
 * of its modules. The file is absolute, as Vitest names it.
 */
export type RoutesAheadNews = { testFile: string; opened?: string };

/**
 * Where the page asks the dev server for the modules to preload as a tab
 * starts, and tells it the modules that its first test file loaded, with a
 * `ModulesAheadQuestion`. Answered with their paths, or with `null` for what
 * the page tells.
 */
export const modulesAheadEvent = "vitest-plugin-rsc:next-modules-ahead";

/**
 * Nothing, for the modules to preload, or the paths of the modules that the
 * first test file of a tab loaded natively. The file is absolute, as Vitest
 * names it.
 */
export type ModulesAheadQuestion = { loaded?: { testFile: string; modules: string[] } };
