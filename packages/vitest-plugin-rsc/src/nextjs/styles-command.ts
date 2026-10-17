// What the page and the dev server share about the stylesheets of a route,
// and of a file of the host with `"use client"`: see styles.ts. The page asks
// for them before Next renders the route, and the dev server answers at
// `stylesheetsPath`. Under Vitest a command of Vitest's answers for a route
// instead, which knows the test file that asks (setup.ts). A static build has
// them in a file: see styles-shared.ts.

export type { Stylesheets } from "./styles-shared.ts";

/**
 * The browser command that the test's page calls for the stylesheets of a
 * route, before Next renders it: see styles.ts. Not a name with `__vitest` in
 * front: Vitest keeps those from the page.
 */
export const stylesheetsCommand = "vitestPluginRscStylesheets";

/**
 * Where the dev server answers the page with stylesheets, as JSON. For a
 * route: `?entry=<name of its modules>&inline=<true|false>`, with
 * `Stylesheets`. For a file of the host with `"use client"`: `?url=<its URL
 * in the browser layer>`, with the URLs of its stylesheets.
 */
export const stylesheetsPath = "/@vitest-plugin-rsc/next-stylesheets";
