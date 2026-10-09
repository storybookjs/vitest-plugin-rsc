// What the page and the plugin share about the stylesheets of a route: see
// styles.ts. The page asks for them before Next renders the route. With a
// dev server it asks the server, at `stylesheetsPath`, under any host. A
// static build has them in a file.

/**
 * Where the dev server answers the page with the stylesheets of a route:
 * `?entry=<name of its modules>&inline=<true|false>`, and for the route of a
 * node `&file=<file>` for each file of the host that renders the node.
 */
export const stylesheetsPath = "/@vitest-plugin-rsc/next-stylesheets";

/** The file of a static build with the stylesheets of every page route, in its directory. */
export const builtStylesheetsFile = "vitest-plugin-rsc/next-stylesheets.json";

/**
 * What the loader tree of the route of a node names its page, where a page of
 * the app has its file. Next looks up the stylesheets of the node by it.
 */
export const componentPagePath = "vitest-plugin-rsc/component";

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
   * the build. The route of a node has an empty list for the node, at
   * `componentPagePath`: its stylesheets are those of the files that render it.
   */
  routes: Record<string, Record<string, string[]>>;
  /**
   * For each file of the host that has any, by its path from the root of the
   * project: the files of the stylesheets of what it imports, as for a segment.
   */
  hostFiles: Record<string, string[]>;
};

/**
 * A file of the host by its path from the root of the project, as a build has
 * it: `stories/button.stories.tsx` for `./stories/button.stories.tsx`.
 */
const fromRoot = (file: string) => file.replace(/^(\.\/)+/, "");

/**
 * The stylesheets of a route of a static build that is served from
 * `directory`, a URL. Next links a stylesheet at its path under the asset
 * path, from the root of the site. A build can be served from any directory,
 * so that path goes up to the root first when it has to:
 * `/_next/../docs/_next/static/css/page.css`.
 *
 * The node of a route of a node has the stylesheets of `files`, the files of
 * the host that render it, by their path from the root of the project.
 * Without any, those of every file of the host, as with a dev server.
 *
 * Next inlines no CSS of a static build: what a stylesheet of it names, like a
 * font, is named by the way from that stylesheet.
 */
export function builtStylesheetsOf(
  built: BuiltStylesheets,
  entry: string,
  directory: string,
  files?: string[],
): Stylesheets {
  const from = built.assetPath.split("/").filter(Boolean);
  const pathOf = (file: string) => {
    const to = `${new URL(directory).pathname}${file}`.split("/").filter(Boolean);
    let common = 0;
    while (common < from.length && common < to.length - 1 && from[common] === to[common]) common++;
    return [...from.slice(common).map(() => ".."), ...to.slice(common)].join("/");
  };
  const ofNode = () => [
    ...new Set(
      (files?.length ? files.map(fromRoot) : Object.keys(built.hostFiles)).flatMap((file) =>
        Object.hasOwn(built.hostFiles, file) ? built.hostFiles[file]! : [],
      ),
    ),
  ];
  return Object.fromEntries(
    Object.entries(built.routes[entry] ?? {}).map(([segment, stylesheets]) => [
      segment,
      (segment === componentPagePath ? ofNode() : stylesheets).map((file) => ({
        path: pathOf(file),
      })),
    ]),
  );
}
