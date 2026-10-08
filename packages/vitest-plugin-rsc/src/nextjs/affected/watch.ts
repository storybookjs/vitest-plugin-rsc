import type { TestProject, Vitest } from "vitest/node";
import { modulesNamed } from "./dependencies.ts";
import { beforeWatchLookup } from "./vitest.ts";

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

export function watchMode(
  vitest: Vitest,
  project: TestProject,
  options: {
    /** The Vite environment of the test files and of the modules of the routes. */
    environment: string;
    /** The ids of the modules that list the routes. */
    lists: string[];
  },
) {
  // The modules each test file has loaded, since it last changed.
  const loaded = new Map<string, Set<string>>();
  const graph = () => project.vite.environments[options.environment]?.moduleGraph;

  // A route by the id of its module, the module of a Server Action by its file.
  const named = (name: string) => {
    const modules = graph();
    return modules ? modulesNamed(modules, name, project.config.root) : [];
  };
  const testsOf = (testFile: string) => [...(graph()?.getModulesByFile(testFile) ?? [])];

  const unlink = (testFile: string) => {
    for (const name of loaded.get(testFile) ?? []) {
      for (const loadedModule of named(name)) {
        for (const test of testsOf(testFile)) loadedModule.importers.delete(test);
      }
    }
    loaded.delete(testFile);
  };

  const link = () => {
    // Vite puts these back when it transforms the list again.
    for (const list of options.lists.flatMap(named)) {
      for (const route of list.importedModules) route.importers.delete(list);
    }
    for (const [testFile, names] of loaded) {
      for (const loadedModule of [...names].flatMap(named)) {
        for (const test of testsOf(testFile)) loadedModule.importers.add(test);
      }
    }
  };

  beforeWatchLookup(vitest, (file) => {
    // A test file that changed runs again, and says what it loads now.
    if (loaded.has(file)) unlink(file);
    link();
  });

  return {
    loaded(testFile: string, modules: string[]): void {
      let all = loaded.get(testFile);
      if (!all) loaded.set(testFile, (all = new Set()));
      for (const id of modules) all.add(id);
    },
  };
}
