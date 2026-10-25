import path from "node:path";
import { normalizePath, type Plugin } from "vite";
import type { Vitest } from "vitest/node";

// Vitest's hook of a plugin of a project.
type VitestContext = {
  vitest: Vitest;
  defineCacheKeyGenerator?: (generate: (context: { id: string }) => string | false) => void;
};
type VitestPlugin = { configureVitest(context: VitestContext): void };

/**
 * Stands in for a change to a file of the app while the tests are watched:
 * the dev server invalidates the modules of the file as Vitest's watcher
 * does for a change. With `content`, that is what the file has from then on
 * for the dev server, which leaves the file as it is. Without, it has what is
 * in the file again.
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
        vitest!.invalidateFile(changed);
        response.end();
      });
    },
    load: (id) => contents.get(id.split("?")[0]!),
  };
}
