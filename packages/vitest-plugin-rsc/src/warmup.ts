import path from "node:path";
import { glob, isDynamicPattern } from "tinyglobby";
import { normalizePath, type DevEnvironment, type ViteDevServer } from "vite";
import { isHostModule } from "./host-module.ts";

// The page's layers compiled ahead of the first page: the files that an
// environment's `dev.warmup` names, and what they import. Vite does that as
// its server starts to listen, which under Browser Mode is as the browser
// launches. The dev server of a project of Vitest without Browser Mode does
// not listen, and Vitest has it compile no import ahead of its request
// (`preTransformRequests`). So for a page in a worker of Node.js the plugin
// does both, for the environments that the page runs.

/**
 * Compiles what the `dev.warmup` of each of the page's environments names,
 * with its static imports, in the background. Call it once the optimizers of
 * the environments have done their first bundling: a module compiled before
 * would find no pre-bundle for its dependencies.
 */
export function warmPageEnvironments(server: ViteDevServer): void {
  for (const environment of Object.values(server.environments)) {
    // The rsc layer is Vitest's own `client` environment, which its runner
    // fetches from.
    if (environment.name === "client" || environment.config.consumer !== "client") continue;
    const seen = new Set<string>();
    void warmupFiles(environment, server.config.root).then((urls) =>
      Promise.all(urls.map((url) => warm(environment, url, seen))),
    );
  }
}

// What `dev.warmup` names, as Vite's own warmup reads it: a file, or a glob of
// the app's files.
async function warmupFiles(environment: DevEnvironment, root: string): Promise<string[]> {
  const { warmup } = environment.config.dev;
  const globs = warmup.filter((file) => isDynamicPattern(file));
  const files = [
    ...warmup.filter((file) => !isDynamicPattern(file)).map((file) => path.resolve(root, file)),
    ...(globs.length > 0
      ? await glob(globs, {
          absolute: true,
          cwd: root,
          expandDirectories: false,
          ignore: ["**/.git/**", "**/node_modules/**"],
        })
      : []),
  ];
  // The URL that Vite has for a file: from the root, or by its path.
  return files.map((file) => {
    const fromRoot = path.relative(root, file);
    return fromRoot.startsWith(".") || path.isAbsolute(fromRoot)
      ? `/@fs/${normalizePath(file).replace(/^\//, "")}`
      : `/${normalizePath(fromRoot)}`;
  });
}

async function warm(environment: DevEnvironment, url: string, seen: Set<string>): Promise<void> {
  // A module of the page's host, which the page does not ask the server for.
  if (seen.has(url) || isHostModule(url)) return;
  seen.add(url);
  // Vite logs what it cannot compile, and the page gets the error when it
  // asks for the module.
  await environment.warmupRequest(url);
  const node = await environment.moduleGraph.getModuleByUrl(url).catch(() => undefined);
  await Promise.all((node?.transformResult?.deps ?? []).map((dep) => warm(environment, dep, seen)));
}
