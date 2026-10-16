/**
 * The browser command that the test's page calls for the stylesheets of a
 * route, before Next renders it: see styles.ts. Not a name with `__vitest` in
 * front: Vitest keeps those from the page.
 */
export const stylesheetsCommand = "vitestPluginRscStylesheets";

/**
 * The browser command for the stylesheets of a file of the host with
 * `"use client"`, by its URL in the browser layer: their URLs. Such a file
 * renders without a page, so the page links them itself. See styles.ts.
 */
export const clientStylesheetsCommand = "vitestPluginRscClientStylesheets";

/**
 * The stylesheets of a route. For each file of a segment that has any, by the
 * name the loader tree has for it without its extension, which is how Next
 * looks them up: their paths under `/_next/`, and their CSS where the app has
 * Next inline it (`experimental.inlineCss`).
 */
export type Stylesheets = Record<string, { path: string; content?: string }[]>;
