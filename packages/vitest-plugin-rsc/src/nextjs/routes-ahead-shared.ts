// What the page and the dev server share about the routes a test file opens,
// which the dev server compiles ahead of the file's first page load: see
// routes-ahead.ts.

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
