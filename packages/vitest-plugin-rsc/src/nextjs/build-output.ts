import type { PrerenderManifest } from "next/dist/build";
import {
  nextConfig,
  preview,
  routesManifest,
  routing,
} from "virtual:vitest-plugin-rsc/next-manifest";
import { actionModulePrefix, registry } from "./registry.ts";
import type { Stylesheets } from "./styles-shared.ts";

// What `next build` writes to `.next/`, filled per route as the plugin learns
// it, and read by Next through `load-manifest.external`, the module Next keeps
// out of its own bundle to read those files. The server of a route reads them
// for every request, so what is set here before a request is what that
// request finds.

const anyKey = <T>(create: (key: string) => T) =>
  new Proxy({} as Record<string, T>, {
    get: (_, key) => (typeof key === "string" ? create(key) : undefined),
    has: () => true,
  });

// Next's build lists the CSS files of every layout, page and boundary, by the
// file of the segment, and Next's renderer links them next to that segment.
// Here the plugin says which they are, for the routes that were requested:
// see styles.ts. The stylesheets of a file are the same in every route.
type CssFile = { path: string; inlined: false } | { path: string; inlined: true; content: string };
const stylesheets = new Map<string, CssFile[]>();
// And the fonts of `next/font` that each file uses, the way Next's build lists
// them in its manifest of fonts: the files to preload, of the fonts with
// `preload` on. An empty list for a file whose fonts all have it off, for
// which Next adds a `<link rel="preconnect">`, and nothing for one without
// fonts.
const fontFiles = new Map<string, string[]>();
export function setStylesheets(of: Stylesheets): void {
  for (const [file, entries] of Object.entries(of)) {
    stylesheets.set(
      file,
      entries.map(({ path, content }) =>
        content === undefined ? { path, inlined: false } : { path, inlined: true, content },
      ),
    );
    const fonts = entries.flatMap((entry) => entry.fonts ?? []);
    if (fonts.length === 0) fontFiles.delete(file);
    // As `NextFontManifestPlugin` picks them: a font to preload has `.p.`.
    else
      fontFiles.set(
        file,
        fonts.filter((font) => /\.p\.(?:woff|woff2|eot|ttf|otf)$/.test(font)),
      );
  }
}
// What Next's build writes to `next-font-manifest.json`. Without its flag for
// an app with a font whose fallback has adjusted metrics, which Next sets for
// a font of any route and says with a `<meta name="next-size-adjust">`: the
// fonts here are those of the routes requested so far, so a page would have
// it or not by the pages before it.
const nextFontManifest = {
  pages: {},
  app: new Proxy({} as Record<string, string[]>, {
    get: (_, key) => (typeof key === "string" ? fontFiles.get(key) : undefined),
    has: (_, key) => typeof key === "string" && fontFiles.has(key),
  }),
  appUsingSizeAdjust: false,
  pagesUsingSizeAdjust: false,
};

// Next's build writes a manifest of every client reference. For Vite RSC a
// reference is its module id, so this one answers for any id.
const clientReference = anyKey((id) => anyKey((name) => ({ id, name, chunks: [], async: true })));
const clientReferenceManifest = {
  moduleLoading: { prefix: "", crossOrigin: null },
  clientModules: anyKey((id) => ({ id, name: "*", chunks: [], async: true })),
  ssrModuleMapping: clientReference,
  rscModuleMapping: clientReference,
  entryCSSFiles: anyKey((file) => stylesheets.get(file) ?? []),
  entryJSFiles: anyKey(() => []),
};

const buildManifest = {
  polyfillFiles: [],
  // Next requires a script that starts the app and puts it in the HTML.
  // Nothing loads it: `renderServer()` starts the app.
  rootMainFiles: ["static/chunks/main-app.js"],
  devFiles: [],
  lowPriorityFiles: [],
  pages: {},
};

// Next's build lists the Server Actions of the app in a manifest. Here the
// server lists the ones a request calls, for that request: see ssr.ts.
let serverActions: object = {};
export function setServerActions(ids: Iterable<string>): void {
  serverActions = Object.fromEntries(
    Array.from(ids, (id) => [
      id,
      {
        workers: anyKey(() => ({ moduleId: actionModulePrefix + id, async: true })),
        layer: {},
      },
    ]),
  );
}

// No route is prerendered: nothing is built. The one object that both Next's
// route module and the server's cache (cache.ts) read.
export const prerenderManifest: PrerenderManifest = {
  version: 4,
  routes: {},
  dynamicRoutes: {},
  notFoundRoutes: [],
  preview,
};

// The files of `.next/` that the route module of a page or a route handler
// reads, by the end of their path. What is not here is a file a build does not always write.
const manifests: [suffix: string, manifest: () => unknown][] = [
  // The one Next's build makes: see `routesManifest` in project.ts.
  ["routes-manifest.json", () => routesManifest],
  ["prerender-manifest.json", () => prerenderManifest],
  ["preview-props.json", () => preview],
  ["fallback-build-manifest.json", () => ({})],
  ["build-manifest.json", () => buildManifest],
  ["next-font-manifest.json", () => nextFontManifest],
  [
    "_client-reference-manifest.js",
    () => ({ __RSC_MANIFEST: anyKey(() => clientReferenceManifest) }),
  ],
  [
    "server-reference-manifest.json",
    () => ({ node: serverActions, edge: serverActions, encryptionKey: "" }),
  ],
  ["required-server-files.json", () => ({ config: nextConfig })],
  ["BUILD_ID", () => routing.buildId],
];

/** A file of `.next/`, by its path, as Next's `loadManifest()` reads it. */
export function loadManifest(file: string): unknown {
  return manifests.find(([suffix]) => file.endsWith(suffix))?.[1]();
}

registry.node = {
  loadManifest,
  evalManifest: loadManifest,
  loadManifestFromRelativePath: ({ manifest }: { manifest: string }) => loadManifest(manifest),
  evalManifestFromRelativePath: ({ manifest }: { manifest: string }) => loadManifest(manifest),
};
