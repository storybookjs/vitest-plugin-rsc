import type { Plugin, ResolvedConfig } from "vite";

// `vitest --changed` and `vitest related` pick the test files of a change by
// their imports, and the imports of those, before anything has run. Vitest
// reads them off the modules of Vite's `ssr` environment, also for a test file
// of Browser Mode, which runs in `client`: only a module transformed for a
// module runner says what it imports. The layers of the plugin are other
// environments, so in Browser Mode nothing runs in `ssr`. It is the map of the
// lookup, and the plugin draws it as one graph of the app: without Vite RSC's
// server references. Outside its rsc environment Vite RSC makes a module with
// `"use server"` a reference that imports none of its code, so a change of
// what an action imports would find no test file. It makes no client
// reference there, so `"use client"` needs nothing.
//
// The lookup follows imports alone, not the files a plugin watches for a
// module, like those Tailwind scans for a stylesheet: Vite has no module of
// such a file, only one that it watches.
//
// vitestPluginNext() adds the routes that a test file opens: see
// nextjs/route-lookup.ts. Only for a project of Vitest that runs in the
// browser: without Vitest no lookup reads the map, and a project that runs in
// Node.js runs its modules in `ssr`. The map only has more than Vitest's own:
// no test file is found for fewer changes.

/** The Vite environment Vitest reads the imports of a test file in. */
export const lookupEnvironment = "ssr";

/** The name of Vite RSC's plugin that makes a server reference. */
export const useServerPlugin = "rsc:use-server";

type Transform = (this: unknown, code: string, id: string) => unknown;
type Context = { environment?: { name: string; getTopLevelConfig(): ResolvedConfig } };
type Project = { config: { browser: { enabled: boolean } }; vite: { config: ResolvedConfig } };

/**
 * Which Vite servers draw the map: those of the projects of Vitest that run
 * in the browser. Not one that a project in Node.js shares, which runs its
 * modules in `ssr`, and none without Vitest.
 */
export function lookupServers() {
  const inBrowser = new WeakSet<ResolvedConfig>();
  const inNode = new WeakSet<ResolvedConfig>();
  const draws = (config: ResolvedConfig) => inBrowser.has(config) && !inNode.has(config);
  return {
    /** For the `configureVitest` hook: whether the project's server draws it, as far as known. */
    add({ config, vite }: Project) {
      (config.browser.enabled ? inBrowser : inNode).add(vite.config);
      return draws(vite.config);
    },
    /** Whether a hook runs in the lookup's environment of a server that draws it. */
    inLookup(context: unknown) {
      const { environment } = context as Context;
      return environment?.name === lookupEnvironment && draws(environment.getTopLevelConfig());
    },
  };
}

/** Vite RSC's plugins, with the code of a Server Action on the map of Vitest's lookup. */
export function mapOfRelatedLookup(plugins: Plugin[]): Plugin[] {
  const servers = lookupServers();
  if (!plugins.some(({ name }) => name === useServerPlugin)) {
    throw new Error(`vitest-plugin-rsc: Vite RSC has no plugin \`${useServerPlugin}\` anymore.`);
  }
  return [
    {
      name: "vitest-plugin-rsc:related-lookup",
      configureVitest({ project }) {
        servers.add(project);
      },
    },
    ...plugins.map((plugin) => {
      if (plugin.name !== useServerPlugin) return plugin;
      const hook =
        typeof plugin.transform === "function" ? { handler: plugin.transform } : plugin.transform;
      if (!hook) {
        throw new Error(
          `vitest-plugin-rsc: Vite RSC's plugin \`${useServerPlugin}\` has no transform anymore.`,
        );
      }
      const transform = hook.handler as Transform;
      return {
        ...plugin,
        transform: {
          ...hook,
          async handler(code: string, id: string) {
            const result = await transform.call(this, code, id);
            // The module as it is, after Vite RSC had its say: a module that
            // it refuses still fails, which the lookup counts as a change.
            return servers.inLookup(this) ? undefined : result;
          },
        },
      } as Plugin;
    }),
  ];
}
