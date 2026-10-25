import path from "node:path";
import { normalizePath, type Environment, type Plugin } from "vite";
import type { Vitest } from "vitest/node";

// Vitest's hook of a plugin of a project.
type VitestContext = {
  vitest: Vitest;
  defineCacheKeyGenerator?: (generate: (context: { id: string }) => string | false) => void;
};
type VitestPlugin = { configureVitest(context: VitestContext): void };

// Where Vitest keeps the module of an id in its cache on disk, by the
// environment: `vitest.invalidateFile()` forgets it, in every project.
type ModuleCache = { invalidateCachePath(environment: Environment, id: string): void };

/**
 * Stands in for a change to a file of the app while the tests are watched:
 * the dev server invalidates the modules of the file as Vitest's watcher
 * does for a change. With `content`, that is what the file has from then on
 * for the dev server, which leaves the file as it is. Without, it has what is
 * in the file again.
 *
 * In the dev server of the project alone, which `vitest.invalidateFile()`
 * does in every project: the other projects, which run at the same time,
 * have the file as it is, and the invalidation would be a change of their
 * modules, which starts a kept app anew in the middle of a test.
 */
export function fileChangeService(): Plugin & VitestPlugin {
  const contents = new Map<string, string>();
  let vitest: Vitest | undefined;
  return {
    name: "playground:file-change-service",
    enforce: "pre",
    configureVitest(context: VitestContext) {
      vitest = context.vitest;
      // Vitest keeps what it compiled on disk by the content of the file on
      // disk, which a change here leaves as it is: a changed file is not kept.
      context.defineCacheKeyGenerator?.(({ id }) => (contents.has(id.split("?")[0]!) ? false : ""));
    },
    configureServer(server) {
      server.middlewares.use("/service/file-change", (request, response) => {
        const { searchParams } = new URL(request.url ?? "/", "http://localhost");
        const changed = normalizePath(
          path.join(server.config.root, searchParams.get("file") ?? ""),
        );
        const content = searchParams.get("content");
        if (content === null) contents.delete(changed);
        else contents.set(changed, content);
        // What `vitest.invalidateFile()` does, in the environments of this
        // server alone. Where Vitest has its cache of modules elsewhere,
        // `invalidateFile()` itself: in every project, but no stale module.
        const cache = (vitest!.cache as unknown as { _modules?: Partial<ModuleCache> })._modules;
        if (!cache?.invalidateCachePath) {
          vitest!.invalidateFile(changed);
        } else {
          for (const environment of Object.values(server.environments)) {
            for (const node of environment.moduleGraph.getModulesByFile(changed) ?? []) {
              environment.moduleGraph.invalidateModule(node);
              cache.invalidateCachePath(environment, node.id!);
            }
          }
        }
        response.end();
      });
    },
    load: (id) => contents.get(id.split("?")[0]!),
  };
}
