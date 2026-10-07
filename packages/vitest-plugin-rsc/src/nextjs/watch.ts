import type { TestProject, Vitest } from "vitest/node";

// Watch mode: which test files to run again for a file that changed.
//
// Vitest finds them in Vite's module graph: it walks from the file to what
// imports it, up to the test files. A test that opens a route with
// `renderServer({ url })` does not import `page.tsx`. The plugin does, in one
// module that lists every route and that every test file ends up importing.
// So in the graph every test file imports every route, and an edit of one
// page would run them all.
//
// The tab says which routes a test file has loaded. Right before Vitest looks
// up the test files for a change, the graph is made to say the same: the list
// no longer imports the routes, and a test file imports the ones it loaded.

/**
 * The browser command the tab calls for a route it loads: see rsc.ts. Not a
 * name with `__vitest` in front: Vitest keeps those from the tab.
 */
export const routeLoadedCommand = "vitestPluginRscRouteLoaded";

export type RouteKind = "page" | "route";

export function createRouteWatch(options: {
  /** The Vite environment of the test files and of the modules of the routes. */
  environment: string;
  /** The ids of the modules that list the routes. */
  lists: string[];
  /** The ids of the modules of a route. */
  modulesOf(kind: RouteKind, page: string): string[];
}) {
  // The modules of the routes each test file has loaded.
  const loaded = new Map<string, Set<string>>();

  return {
    /** For `test.browser.commands`, under `routeLoadedCommand`. */
    command({ testPath }: { testPath: string | undefined }, kind: RouteKind, page: string): void {
      if (!testPath) return;
      let modules = loaded.get(testPath);
      if (!modules) loaded.set(testPath, (modules = new Set()));
      for (const id of options.modulesOf(kind, page)) modules.add(id);
    },
    /** Once Vitest has the project. */
    start: (vitest: Vitest, project: TestProject) => start(vitest, project, options, loaded),
  };
}

function start(
  vitest: Vitest,
  project: TestProject,
  options: { environment: string; lists: string[] },
  loaded: Map<string, Set<string>>,
): void {
  const graph = () => project.vite.environments[options.environment]?.moduleGraph;

  const unlink = (testFile: string) => {
    const modules = graph();
    for (const id of loaded.get(testFile) ?? []) {
      const route = modules?.getModuleById(id);
      for (const test of modules?.getModulesByFile(testFile) ?? []) route?.importers.delete(test);
    }
    loaded.delete(testFile);
  };

  const link = () => {
    const modules = graph();
    if (!modules) return;
    // Vite puts these back when it transforms the list again.
    for (const id of options.lists) {
      const list = modules.getModuleById(id);
      for (const route of list?.importedModules ?? []) route.importers.delete(list!);
    }
    for (const [testFile, routes] of loaded) {
      for (const test of modules.getModulesByFile(testFile) ?? []) {
        for (const id of routes) modules.getModuleById(id)?.importers.add(test);
      }
    }
  };

  // Vitest calls this for every file that changes, before it looks up the
  // test files. It returns nothing, so the lookup is Vitest's.
  (vitest.config.watchTriggerPatterns ??= []).push({
    pattern: /./,
    testsToRun(file) {
      // A test file that changed runs again, and says what it loads now.
      if (loaded.has(file)) unlink(file);
      link();
    },
  });
}
