// What the page and the plugin share about the stylesheets of a route: see
// styles.ts. The page asks for them before Next renders the route, in one of
// three ways. Under Vitest with a command of Vitest's, which knows the test
// file that asks (setup.ts). Under another host, like Storybook, the dev
// server answers at `stylesheetsPath`. A static build has them in a file.

/**
 * The browser command that the test's page calls for the stylesheets of a
 * route, before Next renders it: see styles.ts. Not a name with `__vitest` in
 * front: Vitest keeps those from the page.
 */
export const stylesheetsCommand = "vitestPluginRscStylesheets";

/**
 * Where the dev server answers the page of another host than Vitest with the
 * stylesheets of a route: `?entry=<name of its modules>&inline=<true|false>`.
 */
export const stylesheetsPath = "/@vitest-plugin-rsc/next-stylesheets";

/** The file of a static build with the stylesheets of every page route, in its directory. */
export const builtStylesheetsFile = "vitest-plugin-rsc/next-stylesheets.json";

/**
 * The stylesheets of a route. For each file of a segment that has any, by the
 * name the loader tree has for it without its extension, which is how Next
 * looks them up: their paths under `/_next/`, and their CSS where the app has
 * Next inline it (`experimental.inlineCss`).
 */
export type Stylesheets = Record<string, { path: string; content?: string }[]>;

/** What `builtStylesheetsFile` has: the stylesheets of a build, as files of it. */
export type BuiltStylesheets = {
  /** Where the browser asks for the files of the app, `/_next/`, from which Next links a stylesheet. */
  assetPath: string;
  /**
   * For each page route, by the name of its modules: the files of its
   * stylesheets, per segment as `Stylesheets` has them, from the directory of
   * the build.
   */
  routes: Record<string, Record<string, string[]>>;
};

/**
 * The stylesheets of a route of a static build that is served from
 * `directory`, a URL. Next links a stylesheet at its path under the asset
 * path, from the root of the site. A build can be served from any directory,
 * so that path goes up to the root first when it has to:
 * `/_next/../docs/_next/static/css/page.css`.
 *
 * Next inlines no CSS of a static build: what a stylesheet of it names, like a
 * font, is named by the way from that stylesheet.
 */
export function builtStylesheetsOf(
  built: BuiltStylesheets,
  entry: string,
  directory: string,
): Stylesheets {
  const from = built.assetPath.split("/").filter(Boolean);
  const pathOf = (file: string) => {
    const to = `${new URL(directory).pathname}${file}`.split("/").filter(Boolean);
    let common = 0;
    while (common < from.length && common < to.length - 1 && from[common] === to[common]) common++;
    return [...from.slice(common).map(() => ".."), ...to.slice(common)].join("/");
  };
  return Object.fromEntries(
    Object.entries(built.routes[entry] ?? {}).map(([segment, files]) => [
      segment,
      files.map((file) => ({ path: pathOf(file) })),
    ]),
  );
}
