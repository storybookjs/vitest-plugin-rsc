import path from "node:path";
import { getPluginApi } from "@vitejs/plugin-rsc/plugin";
import { normalizePath, type Plugin } from "vite";
import { withStaticBuild } from "../static-build.ts";

// Next's part of the static build, which ../static-build.ts builds: the ssr
// layer, which runs through a module runner like the browser layer, with the
// Client Components that server code renders, the files that Next's loaders
// made and the stylesheets of the routes (styles.ts), and the options of
// `next.config` that are paths of the machine.

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
 * imports by a module of its own, which the build bundles. A build would
 * otherwise have the directory it was built in, and differ from machine to
 * machine.
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
  /** The Vite environment of each layer. */
  environments: { rsc: string; ssr: string; browser: string };
  /** What the page imports to start the layers that run through a module runner. */
  entries: { ssr: string; browser: string };
  /** The files Next's loaders made for the browser, by the path it asks for. */
  emittedFiles(): { pathname: string; body: Uint8Array }[];
  /** The plugin's module of the rsc layer, which renders the routes: rsc.ts. */
  rscModule: string;
  /** Whether a module of the rsc layer's build is a file of the host. */
  isHostFile(id: string): boolean;
};

type Manager = NonNullable<ReturnType<typeof getPluginApi>>["manager"];

export function nextStaticBuild(options: NextStaticBuildOptions): Plugin {
  const { rsc, ssr, browser } = options.environments;
  // Set once the config is resolved.
  let manager: Manager | undefined;
  // The keys of the client references that server code reaches in the rsc
  // layer, once it is built: see `buildEnd`.
  let reached: ReadonlySet<string> | undefined;
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
        // The Client Components that the ssr layer renders: see `buildEnd`.
        clientReferences: { [ssr]: () => reached },
      });
    },
    configResolved(resolved) {
      if (resolved.command !== "build") return;
      manager = getPluginApi(resolved)?.manager;
      // The plugin of ../index.ts builds the layers.
      if (!resolved.plugins.some((plugin) => plugin.name === "vitest-plugin-rsc:static-build")) {
        throw new Error("vitest-plugin-rsc: vitestPluginNext() needs vitestPluginRSC().");
      }
    },
    // The client references that server code reaches in the module graph of
    // the rsc layer, in the build that gives each the key of a Flight
    // payload, before the ssr layer's. Server code starts in the plugin's
    // module of the layer, which renders the routes, and in every file of the
    // host that is not a reference itself, `host.files`, which can render a
    // node. It goes through static and dynamic imports, up to a reference:
    // what that one imports is the browser's code. Any other is imported only
    // by the host's runtime, a module that is no file of the host, like the
    // module script of a page or a package of the host: the browser layer
    // evaluates it. A graph without the plugin's module renders no route,
    // and lists every one.
    buildEnd(error) {
      if (error || this.environment.mode !== "build" || this.environment.name !== rsc) return;
      if (!manager || manager.isScanBuild) return;
      reached = undefined;
      if (!this.getModuleInfo(options.rscModule)) return;
      const references = manager.clientReferenceMetaMap;
      const found = new Set<string>();
      const queue = [...this.getModuleIds()].filter(
        (id) => id === options.rscModule || (options.isHostFile(id) && !references[id]),
      );
      const seen = new Set(queue);
      for (const id of queue) {
        const reference = references[id];
        if (reference) {
          found.add(reference.referenceKey);
          continue;
        }
        const info = this.getModuleInfo(id);
        for (const imported of [
          ...(info?.importedIds ?? []),
          ...(info?.dynamicallyImportedIds ?? []),
        ]) {
          if (seen.has(imported)) continue;
          seen.add(imported);
          queue.push(imported);
        }
      }
      reached = found;
    },
  };
}
