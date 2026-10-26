import fs from "node:fs";
import path from "node:path";
import { normalizePath, type Plugin, type ViteDevServer } from "vite";
import { answerPage } from "../page-bridge.ts";
import {
  modulesAheadEvent,
  routesAheadEvent,
  type ModulesAheadQuestion,
  type RoutesAheadNews,
} from "./routes-ahead-shared.ts";

// The first page load of a tab waits for the dev server to compile its route:
// the modules of the app in the rsc layer, its Client Components in the layer
// of the browser, and its CSS. The modules of Next and of packages are
// pre-bundled, the app's are not. On an app of a few hundred modules with
// Tailwind that is half of the first page load, while the tab runs the hooks
// before it, like the app's `beforeEach` that sets up its database. So the
// dev server keeps which routes each test file opened, on disk, and compiles
// them as the file starts in a tab again, one module at a time (see
// `compileRoute()` in styles.ts). The page still asks for every module and
// stylesheet; it finds them compiled. Which routes is the last run's: a test
// can open a route by any URL, through any helper. A file that runs for the
// first time compiles nothing ahead.
//
// The modules that the page's server layers import natively, over HTTP: the
// rsc layer's and the external modules of the runners. The browser finds the
// imports of a module once it has it, so the first page load of a tab waits
// for a round trip to the dev server per level of imports, some twenty for
// Next's server. So the dev server keeps which modules each test file loaded
// as the first file of its tab, and the next run's tabs preload those of
// every such file at once, as the hooks of their first file start: see
// `preloadModulesAhead()` in setup.ts.

export type RoutesAheadOptions = {
  /** The root of the project, under whose `node_modules/.cache/` the routes are kept. */
  root(): string;
  /** Has the dev server compile a route, by the name of its modules: see `compileRoute()` in styles.ts. */
  compile(vite: ViteDevServer, entry: string): Promise<unknown>;
  /** The environment whose modules the page imports natively: the rsc layer's. */
  environment: string;
};

// By the path of each test file from the root: the routes in the order the
// file first opened them, and the modules it loaded. The version of the
// format is in the name.
const cacheFile = "node_modules/.cache/vitest-plugin-rsc/routes-ahead-2.json";
type Kept = { files: Map<string, string[]>; modules: Map<string, string[]> };

export function routesAheadPlugin(options: RoutesAheadOptions): Plugin {
  let kept: Kept | undefined;
  // The routes each file opened in this run, which replace those of the run
  // before once it opens one: a route the file no longer opens goes.
  const opened = new Map<string, string[]>();

  function read(): Kept {
    if (kept) return kept;
    try {
      const { files, modules } = JSON.parse(
        fs.readFileSync(path.join(options.root(), cacheFile), "utf8"),
      );
      kept = {
        files: new Map(Object.entries(files as Record<string, string[]>)),
        modules: new Map(Object.entries(modules as Record<string, string[]>)),
      };
    } catch {
      kept = { files: new Map(), modules: new Map() };
    }
    return kept;
  }

  // By a rename, so that a run that reads it at the same time reads all of
  // it. A disk that cannot be written to only means nothing ahead next time.
  function write({ files, modules }: Kept): void {
    const file = path.join(options.root(), cacheFile);
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const written = `${file}.${process.pid}`;
      fs.writeFileSync(
        written,
        JSON.stringify({
          files: Object.fromEntries(files),
          modules: Object.fromEntries(modules),
        }),
      );
      fs.renameSync(written, file);
    } catch {}
  }

  // Not a pre-bundled dependency of another version of the pre-bundle, which
  // the page would fetch in vain: Vite puts the version in its URL.
  function current(vite: ViteDevServer, modules: string[]): string[] {
    const version = vite.environments?.[options.environment]?.depsOptimizer?.metadata.browserHash;
    if (!version) return modules;
    return modules.filter((url) => {
      const asked = new URL(url, "http://n").searchParams.get("v");
      return asked === null || asked === version;
    });
  }

  return {
    name: "vitest-plugin-rsc:next-routes-ahead",
    configureServer(vite) {
      answerPage(vite, routesAheadEvent, async ({ testFile, opened: entry }: RoutesAheadNews) => {
        const file = normalizePath(path.relative(options.root(), testFile));
        const routes = read().files;
        if (entry === undefined) {
          // One after the other, in the order the file opens them: its first
          // page load needs the first.
          for (const ahead of routes.get(file) ?? []) {
            await options.compile(vite, ahead).catch(() => {});
          }
          return null;
        }
        const now = opened.get(file) ?? [];
        opened.set(file, now);
        if (now.includes(entry)) return null;
        now.push(entry);
        const before = routes.get(file);
        if (before?.length === now.length && before.every((route, i) => route === now[i])) {
          return null;
        }
        routes.set(file, [...now]);
        write(read());
        return null;
      });
      answerPage(vite, modulesAheadEvent, ({ loaded }: ModulesAheadQuestion) => {
        const { modules } = read();
        if (loaded === undefined) return current(vite, [...new Set([...modules.values()].flat())]);
        // What the file loads now replaces what it loaded before.
        modules.set(normalizePath(path.relative(options.root(), loaded.testFile)), loaded.modules);
        write(read());
        return null;
      });
    },
  };
}
