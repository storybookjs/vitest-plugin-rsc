// What the page and the plugin share about the stylesheets of a route, and
// of a file of the host with `"use client"`: see styles.ts. The page asks for
// them before Next renders the route. With a dev server it asks the dev
// server, at `stylesheetsPath`. A static build has them in a file.

/** The file of a static build with the stylesheets of every page route, in its directory. */
export const builtStylesheetsFile = "vitest-plugin-rsc/next-stylesheets.json";

/**
 * Where the dev server answers the page with stylesheets, as JSON. For a
 * route: `?entry=<name of its modules>&inline=<true|false>`, with
 * `Stylesheets`, and a `file=<path>` for each file of the host that renders
 * the node of the route, in their order, absolute or from the root of the
 * project: see `nodeFiles` in registry.ts. For a file of the host with
 * `"use client"`: `?url=<its URL in the browser layer>`, with the URLs of
 * its stylesheets.
 */
export const stylesheetsPath = "/@vitest-plugin-rsc/next-stylesheets";

/**
 * What the loader tree of the route of a node names its page, where a page of
 * the app has its file. Next looks up the stylesheets of the node by it.
 */
export const componentPagePath = "vitest-plugin-rsc/component";

/**
 * The stylesheets of a route. For each file of a segment that has any, by the
 * name the loader tree has for it without its extension, which is how Next
 * looks them up: their paths under `/_next/`, and their CSS where the app has
 * Next inline it (`experimental.inlineCss`). The name is the path of the file
 * from the root of the project, `app/layout`: see `RouteSegment` in project.ts.
 */
export type Stylesheets = Record<string, { path: string; content?: string }[]>;

/** What `builtStylesheetsFile` has: the stylesheets of a build, as files of it. */
export type BuiltStylesheets = {
  /** Where the browser asks for the files of the app, `/_next/`, from which Next links a stylesheet. */
  assetPath: string;
  /**
   * For each page route, by the name of its modules: the files of its
   * stylesheets, per segment as `Stylesheets` has them, from the directory of
   * the build. The route of a node has an empty list for the node, at
   * `componentPagePath`: a build has no files of the host that render one.
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
    // Decoded: Next encodes the path it links.
    const to = `${decodeURIComponent(new URL(directory).pathname)}${file}`
      .split("/")
      .filter(Boolean);
    let common = 0;
    while (common < from.length && common < to.length - 1 && from[common] === to[common]) common++;
    return [...from.slice(common).map(() => ".."), ...to.slice(common)].join("/");
  };
  return Object.fromEntries(
    Object.entries(built.routes[entry] ?? {}).map(([segment, stylesheets]) => [
      segment,
      stylesheets.map((file) => ({ path: pathOf(file) })),
    ]),
  );
}
