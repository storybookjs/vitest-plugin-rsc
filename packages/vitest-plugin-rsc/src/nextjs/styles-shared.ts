// What the page and the plugin share about the stylesheets of a route, and
// of a file of the host: see styles.ts. The page asks for them before Next
// renders the route. With a dev server it asks the dev server over the
// page's websocket (`stylesheetsEvent`). A static build has
// them in a file, with the modules of every route.

/**
 * The file of a static build with the files a page loads besides the layers:
 * the stylesheets and the modules of every page route, and the stylesheets
 * of every file of the host, in its directory.
 */
export const builtFilesPath = "vitest-plugin-rsc/next-files.json";

/**
 * Where the dev server answers the page with stylesheets, over the websocket
 * of the page (`askDevServer()` in ../utils.ts), for a `StylesheetsQuestion`.
 */
export const stylesheetsEvent = "vitest-plugin-rsc:next-stylesheets";

/**
 * What the dev server tells the page after a change of stylesheets that it
 * links, without class names: the URL of the version of now of each, which
 * the page moves every link of the stylesheet to (stylesheet-versions.ts).
 */
export const stylesheetsChangedEvent = "vitest-plugin-rsc:next-stylesheets-changed";

/**
 * What the dev server tells the page as its watcher sees a file added,
 * changed or removed: the stylesheets of a route that it answered at
 * `stylesheetsEvent` may be others now. Nothing else changes them. A run
 * without a watcher, `vitest run`, hears none.
 */
export const filesChangedEvent = "vitest-plugin-rsc:next-files-changed";

/** Where Next's build puts the CSS of an app, under `/_next/`. */
export const cssDirectory = "static/css";
/**
 * The version of its CSS that the path of a stylesheet of the dev server has
 * after the directory, `static/css/<version>/app/globals.css`: see styles.ts.
 */
export const cssVersionPattern = "[0-9a-f]{16}";
const versionSegmentRE = new RegExp(`/${cssDirectory}/${cssVersionPattern}/`);

/**
 * The stylesheet that a URL of a link is of, whatever its version and however
 * its path is encoded: the path of the URL without its version, decoded.
 * Nothing for a URL that is no stylesheet of the dev server.
 */
export function stylesheetOfUrl(url: string): string | undefined {
  const { pathname } = new URL(url, "http://n");
  if (!versionSegmentRE.test(pathname)) return undefined;
  try {
    return pathname
      .replace(versionSegmentRE, `/${cssDirectory}/`)
      .split("/")
      .map(decodeURIComponent)
      .join("/");
  } catch {
    return undefined;
  }
}

/**
 * What the page asks at `stylesheetsEvent`. For a route: by the name of its
 * modules, with `Stylesheets`, and `files`, the files of the host that render
 * the node of the route, in their order, absolute or from the root of the
 * project: see `hostFiles` of `renderServer()`. For the files of the host
 * that the host uses, `linkStylesheetsOf()`: by their paths, as
 * `hostFiles`, with the URLs of their stylesheets.
 */
export type StylesheetsQuestion =
  | { entry: string; inline: boolean; files: string[] }
  | { hostFiles: string[] };

/**
 * What marks the `<link>` of a stylesheet of a file of the host, which
 * `linkStylesheetsOf()` linked (client-graph.ts): the host's, not a page's,
 * so a page that is left does not take it (document.ts).
 */
export const graphStylesheetAttribute = "data-vitest-plugin-rsc-graph";

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
 * The stylesheet of a `next/font` call has its font files too, under
 * `/_next/`, which Next preloads with the segment.
 */
export type Stylesheets = Record<string, { path: string; content?: string; fonts?: string[] }[]>;

/** What `builtFilesPath` has: the stylesheets and the modules of a build, as files of it. */
export type BuiltFiles = {
  /** Where the browser asks for the files of the app, `/_next/`, from which Next links a stylesheet. */
  assetPath: string;
  /**
   * For each page route, by the name of its modules: the files of its
   * stylesheets, per segment as `Stylesheets` has them, from the directory of
   * the build. The route of a node has an empty list for the node, at
   * `componentPagePath`: those are the stylesheets of the files of the host
   * that render it, which the host names when it renders, see `hostFiles`.
   */
  routes: Record<string, Record<string, string[]>>;
  /**
   * For each file of the host that the rsc layer built, by its path from the
   * root of the project, `host/button.demo.tsx`: the files of the
   * stylesheets it imports, as the dev server walks them for `hostFiles` of
   * `renderServer()`. In a build the files of the host are what `host.files`
   * of `vitestPluginNext()` matches. An empty list for one without any.
   */
  hostFiles: Record<string, string[]>;
  /** The files of the rsc layer that `modules` names, from the directory of the build. */
  chunks: string[];
  /**
   * For each page route, by the name of its modules: the files of the rsc
   * layer that its entry loads, by their index in `chunks`, the entry's own
   * first. Those of the segments and boundaries of its loader tree, and
   * every one those import, but not one that a segment imports with
   * `import()`, which loads only when the segment asks for it, nor one the
   * page has before it loads a route: see route-chunks.ts.
   */
  modules: Record<string, number[]>;
  /**
   * For the stylesheet of each `next/font` call, by its file: the font files
   * of the call, from the directory of the build. See `Stylesheets`.
   */
  fonts: Record<string, string[]>;
};

/**
 * The key of a file of the host in `BuiltFiles.hostFiles`, of a path that
 * the host names it by: from the root of the project, which `./` and `..`
 * may be part of, or absolute. A build has no path of the machine, so an
 * absolute path is the longest key that it ends with.
 */
export function builtFileKey(file: string, keys: string[]): string | undefined {
  file = file.replaceAll("\\", "/");
  if (file.startsWith("/") || /^[a-z]:\//i.test(file)) {
    let found: string | undefined;
    for (const key of keys) {
      if (file.endsWith(`/${key}`) && key.length > (found?.length ?? -1)) found = key;
    }
    return found;
  }
  const segments: string[] = [];
  for (const segment of file.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === ".." && segments.length > 0 && segments.at(-1) !== "..") segments.pop();
    else segments.push(segment);
  }
  const key = segments.join("/");
  return keys.includes(key) ? key : undefined;
}

/**
 * The stylesheets of a route of a static build that is served from
 * `directory`, a URL: what the dev server answers at `stylesheetsEvent`. For
 * the route of a node, the node has the stylesheets of `files`, the files of
 * the host that render it (`hostFiles` of `renderServer()`), in their order,
 * each once. A file that the build has none for, `missing` is told of.
 *
 * Next links a stylesheet at its path under the asset path, from the root of
 * the site. A build can be served from any directory, so that path goes up to
 * the root first when it has to: `/_next/../docs/_next/static/css/page.css`.
 *
 * Next inlines no CSS of a static build: what a stylesheet of it names, like a
 * font, is named by the way from that stylesheet.
 */
export function builtStylesheetsOf(
  built: BuiltFiles,
  entry: string,
  directory: string,
  files: string[] = [],
  missing: (file: string) => void = () => {},
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
  const segments = { ...built.routes[entry] };
  if (segments[componentPagePath] && files.length > 0) {
    const keys = Object.keys(built.hostFiles);
    const ofFiles = files.flatMap((file) => {
      const key = builtFileKey(file, keys);
      if (key === undefined) missing(file);
      return key === undefined ? [] : built.hostFiles[key]!;
    });
    segments[componentPagePath] = [...new Set([...ofFiles, ...segments[componentPagePath]])];
  }
  return Object.fromEntries(
    Object.entries(segments).map(([segment, stylesheets]) => [
      segment,
      stylesheets.map((file) => {
        const fonts = built.fonts[file];
        return fonts ? { path: pathOf(file), fonts: fonts.map(pathOf) } : { path: pathOf(file) };
      }),
    ]),
  );
}

/**
 * The stylesheets of a file of the host in a static build that is served
 * from `directory`, a URL: those that `hostFiles` has for it by its key,
 * `file`, as URLs. What the dev server answers for the file at
 * `stylesheetsEvent`.
 */
export function builtHostFileStylesheetsOf(
  built: BuiltFiles,
  file: string,
  directory: string,
): string[] {
  return (built.hostFiles[file] ?? []).map((stylesheet) => new URL(stylesheet, directory).href);
}
