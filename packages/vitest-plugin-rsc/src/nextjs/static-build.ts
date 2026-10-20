import path from "node:path";
import { normalizePath, type Plugin } from "vite";
import { withStaticBuild } from "../static-build.ts";

// Next's part of the static build, which ../static-build.ts builds: the ssr
// layer, which runs through a module runner like the browser layer, the files
// that Next's loaders made and the stylesheets of the routes (styles.ts), and
// the options of `next.config` that are paths of the machine.

// The options of `next.config` that are files or directories of the machine,
// by their keys, `*` for every key of an object. Next's config loader makes
// the roots and `images.loaderFile` absolute paths. A cache handler and the
// adapter are files that the app names, often with `require.resolve()`.
const configPaths = [
  ["configFile"],
  ["outputFileTracingRoot"],
  ["repoRoot"],
  ["turbopack", "root"],
  ["images", "loaderFile"],
  ["cacheHandler"],
  ["cacheHandlers", "*"],
  ["adapterPath"],
];

/**
 * The `next.config` of the app as the layers of a static build have it: with
 * each option that is a path of the machine as a path from the root of the
 * project, like `next.config.ts` and `../..`. Next's build reads them, and its
 * server reads none for a request but the cache handlers, which the plugin
 * does not load. A build would otherwise have the directory it was built in,
 * and differ from machine to machine.
 *
 * By the options, not by what a value looks like: `basePath: "/app"` of a
 * project in `/app` is no path of the machine.
 */
export function withPathsFromRoot<T>(config: T, root: string): T {
  const copy = JSON.parse(JSON.stringify(config)) as Record<string, unknown>;
  const relativize = (object: Record<string, unknown>, [key, ...rest]: string[]) => {
    for (const name of key === "*" ? Object.keys(object) : [key!]) {
      const value = object[name];
      if (rest.length > 0) {
        if (value && typeof value === "object") {
          relativize(value as Record<string, unknown>, rest);
        }
      } else if (typeof value === "string" && path.isAbsolute(value)) {
        object[name] = normalizePath(path.relative(root, value)) || ".";
      }
    }
  };
  for (const keys of configPaths) relativize(copy, keys);
  return copy as T;
}

export type NextStaticBuildOptions = {
  /** The Vite environment of the ssr and the browser layer. */
  environments: { ssr: string; browser: string };
  /** What the page imports to start the layers that run through a module runner. */
  entries: { ssr: string; browser: string };
  /** The files Next's loaders made for the browser, by the path it asks for. */
  emittedFiles(): { pathname: string; body: Uint8Array }[];
};

export function nextStaticBuild(options: NextStaticBuildOptions): Plugin {
  const { ssr, browser } = options.environments;
  return {
    name: "vitest-plugin-rsc:next-static-build",
    config(_config, { command }) {
      if (command !== "build") return;
      return withStaticBuild({
        entries: { [ssr]: options.entries.ssr, [browser]: options.entries.browser },
        // Next's own files have directives for Turbopack.
        directives: ["use turbopack: no side effects"],
        // The server's platform comes before a module of Next's server.
        strictExecutionOrder: true,
        // What Next's loaders made for the browser, fonts and images, by the
        // path it asks for, and the stylesheets of the routes.
        files: options.emittedFiles,
      });
    },
    configResolved(resolved) {
      if (resolved.command !== "build") return;
      // The plugin of ../index.ts builds the layers.
      if (!resolved.plugins.some((plugin) => plugin.name === "vitest-plugin-rsc:static-build")) {
        throw new Error("vitest-plugin-rsc: vitestPluginNext() needs vitestPluginRSC().");
      }
    },
  };
}
