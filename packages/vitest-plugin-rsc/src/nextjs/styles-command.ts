export type { Stylesheets } from "./styles-shared.ts";

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
