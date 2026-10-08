import { expect, test } from "vitest";
import type { TestProject, Vitest } from "vitest/node";
import { watchMode } from "./watch.ts";

// Vite's module graph, as far as Vitest's watcher walks it: from a module to
// its importers.
type Node = { id: string; file: string; importers: Set<Node>; importedModules: Set<Node> };

function createGraph(imports: Record<string, string[]>) {
  const nodes = new Map<string, Node>();
  const node = (id: string) => {
    if (!nodes.has(id)) {
      nodes.set(id, { id, file: id, importers: new Set(), importedModules: new Set() });
    }
    return nodes.get(id)!;
  };
  for (const [id, imported] of Object.entries(imports)) {
    node(id);
    for (const dep of imported) {
      node(id).importedModules.add(node(dep));
      node(dep).importers.add(node(id));
    }
  }
  return {
    getModuleById: (id: string) => nodes.get(id),
    getModulesByFile: (file: string) => (nodes.has(file) ? new Set([nodes.get(file)!]) : undefined),
    urlToModuleMap: new Map<string, Node>(),
    // What Vitest does for a file that changed.
    testFilesFor(file: string, seen = new Set<string>()): string[] {
      if (seen.has(file)) return [];
      seen.add(file);
      if (file.endsWith(".test.tsx")) return [file];
      return [...(nodes.get(file)?.importers ?? [])].flatMap((importer) =>
        this.testFilesFor(importer.file, seen),
      );
    },
  };
}

function start() {
  // Every test file imports the plugin, which imports the list of the routes.
  const graph = createGraph({
    "notes.test.tsx": ["plugin"],
    "profile.test.tsx": ["plugin", "avatar.tsx"],
    plugin: ["list"],
    list: ["route/0", "route/1"],
    "route/0": ["notes/page.tsx", "layout.tsx"],
    "route/1": ["profile/page.tsx", "layout.tsx"],
    "profile/page.tsx": ["avatar.tsx"],
    // No page imports it: a test calls its Server Action by the id.
    "/actions.ts": [],
  });
  const vitest = { config: {} } as Vitest;
  const project = {
    config: { root: "/" },
    vite: { environments: { client: { moduleGraph: graph } } },
  };
  const watch = watchMode(vitest, project as unknown as TestProject, {
    environment: "client",
    lists: ["list"],
  });
  const { testsToRun } = vitest.config.watchTriggerPatterns![0]!;
  return {
    graph,
    loaded: (testFile: string, page: string) => watch.loaded(testFile, [`route/${page}`]),
    loadedModule: (testFile: string, name: string) => watch.loaded(testFile, [name]),
    // Vitest calls the pattern, and then looks up the test files itself.
    change(file: string) {
      expect(testsToRun(file, /./.exec(file)!)).toBeUndefined();
      return graph.testFilesFor(file).sort();
    },
  };
}

test("without it, a page that changes runs every test file", () => {
  const { graph } = start();

  expect(graph.testFilesFor("notes/page.tsx").sort()).toEqual([
    "notes.test.tsx",
    "profile.test.tsx",
  ]);
});

test("runs the test files that loaded the route of a page that changes", () => {
  const { loaded, change } = start();
  loaded("notes.test.tsx", "0");
  loaded("profile.test.tsx", "1");

  expect(change("notes/page.tsx")).toEqual(["notes.test.tsx"]);
  expect(change("profile/page.tsx")).toEqual(["profile.test.tsx"]);
});

test("runs the test files of every route that a layout is in", () => {
  const { loaded, change } = start();
  loaded("notes.test.tsx", "0");
  loaded("profile.test.tsx", "1");

  expect(change("layout.tsx")).toEqual(["notes.test.tsx", "profile.test.tsx"]);
});

test("runs no test file for a route that none has loaded", () => {
  const { loaded, change } = start();
  loaded("notes.test.tsx", "0");

  expect(change("profile/page.tsx")).toEqual([]);
});

test("still runs a test file for a module that it imports itself", () => {
  const { loaded, change } = start();
  loaded("notes.test.tsx", "1");

  expect(change("avatar.tsx")).toEqual(["notes.test.tsx", "profile.test.tsx"]);
});

test("forgets the routes of a test file that changes, until it runs again", () => {
  const { loaded, change } = start();
  loaded("notes.test.tsx", "0");
  expect(change("notes/page.tsx")).toEqual(["notes.test.tsx"]);

  // The test file is edited, and opens another route now.
  expect(change("notes.test.tsx")).toEqual(["notes.test.tsx"]);
  loaded("notes.test.tsx", "1");

  expect(change("notes/page.tsx")).toEqual([]);
  expect(change("profile/page.tsx")).toEqual(["notes.test.tsx"]);
});

test("runs the test file that called a Server Action of a module no page imports", () => {
  const { loadedModule, change } = start();
  expect(change("/actions.ts")).toEqual([]);

  // By its path from the root, as it is in the id of the action.
  loadedModule("notes.test.tsx", "actions.ts");

  expect(change("/actions.ts")).toEqual(["notes.test.tsx"]);
});
