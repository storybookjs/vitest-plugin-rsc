/**
 * The browser command that the test's page calls for the stylesheets of a
 * route, before Next renders it: see styles.ts. Not a name with `__vitest` in
 * front: Vitest keeps those from the page.
 */
export const stylesheetsCommand = "vitestPluginRscStylesheets";

/**
 * The browser command for what a file of the host loads in the browser layer:
 * a setup file, or a file with `"use client"`. See styles.ts.
 */
export const clientEntryCommand = "vitestPluginRscClientEntry";

/**
 * What a file of the host loads in the browser layer: the modules with
 * `"use client"` that it imports, in order, or the file itself when it has the
 * directive. A test file with the directive renders without a page, so it
 * links its stylesheets itself: their URLs.
 */
export type ClientEntry = {
  modules: { url: string; file: string }[];
  stylesheets: string[];
};

/**
 * The stylesheets of a route. For each file of a segment that has any, by the
 * name the loader tree has for it without its extension, which is how Next
 * looks them up: their paths under `/_next/`, and their CSS where the app has
 * Next inline it (`experimental.inlineCss`).
 */
export type Stylesheets = Record<string, { path: string; content?: string }[]>;
