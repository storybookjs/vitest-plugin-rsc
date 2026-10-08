import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import type { TestModule, TestProject, TestSpecification, Vitest } from "vitest/node";
import { relatedLookup } from "./related.ts";

// A project on disk, and Vite's module graphs as far as they are read: a
// module, its file and what it imports.
type Node = { id: string; file: string; importedModules: Set<Node> };

let root: string;
const at = (file: string) => path.join(root, file);

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "related-"));
  for (const file of [
    "app/notes/page.tsx",
    "app/profile/page.tsx",
    "app/profile/avatar.tsx",
    "app/layout.tsx",
    "app/actions.ts",
    "lib/db.ts",
    "lib/__mocks__/db.ts",
    "vitest.setup.ts",
    "setup-helper.ts",
    "lib/unused.ts",
    "notes.test.tsx",
    "profile.test.tsx",
    "next.config.ts",
    "next.settings.ts",
  ]) {
    fs.mkdirSync(path.dirname(at(file)), { recursive: true });
    fs.writeFileSync(at(file), "");
  }
});

afterEach(() => fs.rmSync(root, { recursive: true }));

function createGraph(imports: Record<string, string[]>) {
  const nodes = new Map<string, Node>();
  const node = (id: string) => {
    if (!nodes.has(id)) nodes.set(id, { id, file: id, importedModules: new Set() });
    return nodes.get(id)!;
  };
  for (const [id, imported] of Object.entries(imports)) {
    node(id);
    for (const dep of imported) node(id).importedModules.add(node(dep));
  }
  return {
    getModuleById: (id: string) => nodes.get(id),
    getModulesByFile: (file: string) => (nodes.has(file) ? new Set([nodes.get(file)!]) : undefined),
    urlToModuleMap: new Map<string, Node>(),
  };
}

// Vitest with one project, from the start of a process to its lookup.
function start(related?: string[]) {
  const rsc = createGraph({
    [at("notes.test.tsx")]: ["plugin", at("lib/db.ts")],
    [at("profile.test.tsx")]: ["plugin"],
    [at("vitest.setup.ts")]: [at("setup-helper.ts")],
    plugin: ["list"],
    list: ["route/notes", "route/profile"],
    "route/notes": [at("app/notes/page.tsx"), at("app/layout.tsx")],
    "route/profile": [at("app/profile/page.tsx"), at("app/layout.tsx")],
    // A Client Component: in this layer it imports nothing.
    [at("app/profile/page.tsx")]: [],
    [at("app/actions.ts")]: [],
  });
  const browser = createGraph({ [at("app/profile/page.tsx")]: [at("app/profile/avatar.tsx")] });
  const config = { reporters: [] as unknown[], related: related && [...related] };
  const tagsFilter: string[] = [];
  const vitest = { config, getGlobalTestNamePattern: () => undefined as RegExp | undefined };
  const project = {
    name: "app",
    config: { root, setupFiles: [at("vitest.setup.ts")], tagsFilter },
    vite: {
      config: { cacheDir: at("node_modules/.vite") },
      environments: { rsc: { moduleGraph: rsc }, browser: { moduleGraph: browser } },
    },
  } as unknown as TestProject;
  const routes = relatedLookup(vitest as unknown as Vitest, project, {
    environments: ["rsc", "browser"],
    lists: ["list"],
    next: () => ({ root, appDir: at("app") }),
    isTestFile: (file) => file.endsWith(".test.tsx"),
  });
  const reporter = config.reporters[0] as {
    onTestRunStart(specifications: TestSpecification[]): void;
    onTestModuleEnd(module: TestModule): void;
    onTestRunEnd(): void;
  };
  return {
    vitest,
    tagsFilter,
    /** A run of a test file that loads these modules. */
    run(testFile: string, loads: string[], run: { state?: string; testNamePattern?: RegExp } = {}) {
      const moduleId = at(testFile);
      reporter.onTestRunStart([{ project, moduleId, ...run } as unknown as TestSpecification]);
      routes.loaded(moduleId, loads);
      reporter.onTestModuleEnd({
        project,
        moduleId,
        state: () => run.state ?? "passed",
      } as unknown as TestModule);
      reporter.onTestRunEnd();
    },
    /** Whether Vitest's lookup keeps a test file: it is in the list afterwards. */
    belongs(testFile: string) {
      expect(routes.transform("ssr", at(testFile))).toEqual({ code: "export {};\n", map: null });
      return config.related!.includes(at(testFile));
    },
    transform: routes.transform,
  };
}

const changed = (...files: string[]) => files.map(at);

test("a test file that has not run belongs to every change", () => {
  expect(start(changed("lib/unused.ts")).belongs("notes.test.tsx")).toBe(true);
  // Also a change outside the project, like a package of the workspace.
  expect(start([path.join(root, "../other/index.ts")]).belongs("notes.test.tsx")).toBe(true);
});

test("a test file that has not run does not belong to a change of another test file", () => {
  expect(start(changed("profile.test.tsx")).belongs("notes.test.tsx")).toBe(false);
});

test("a test file that has run belongs to what it imports and to the routes it loaded", () => {
  start().run("notes.test.tsx", ["route/notes"]);

  for (const file of ["app/notes/page.tsx", "app/layout.tsx", "lib/db.ts", "next.config.ts"]) {
    expect(start(changed(file)).belongs("notes.test.tsx"), file).toBe(true);
  }
  for (const file of ["app/profile/page.tsx", "app/profile/avatar.tsx", "lib/unused.ts"]) {
    expect(start(changed(file)).belongs("notes.test.tsx"), file).toBe(false);
  }
});

test("follows a Client Component into the layer that has its imports", () => {
  start().run("profile.test.tsx", ["route/profile"]);

  expect(start(changed("app/profile/avatar.tsx")).belongs("profile.test.tsx")).toBe(true);
  expect(start(changed("app/notes/page.tsx")).belongs("profile.test.tsx")).toBe(false);
});

test("belongs to the setup files, to what they import, and to the mock of a module", () => {
  start().run("notes.test.tsx", ["route/notes"]);

  for (const file of ["vitest.setup.ts", "setup-helper.ts", "lib/__mocks__/db.ts"]) {
    expect(start(changed(file)).belongs("notes.test.tsx"), file).toBe(true);
  }
});

test("belongs to the module of a Server Action it called, by the id of the action", () => {
  start().run("notes.test.tsx", [at("app/actions.ts")]);

  expect(start(changed("app/actions.ts")).belongs("notes.test.tsx")).toBe(true);
});

test("belongs to a file that is no longer what it was, though it is not in the change", () => {
  start().run("notes.test.tsx", ["route/notes"]);
  // Changed and committed without a run: the page may import something new.
  fs.writeFileSync(at("app/notes/page.tsx"), "import '../../lib/unused.ts';");

  expect(start(changed("lib/unused.ts")).belongs("notes.test.tsx")).toBe(true);
});

test("belongs to a file that is gone", () => {
  start().run("notes.test.tsx", ["route/notes"]);
  fs.rmSync(at("lib/db.ts"));

  expect(start(changed("lib/db.ts")).belongs("notes.test.tsx")).toBe(true);
});

test("forgets a test file that did not pass, or that ran in part", () => {
  const unknown = () => start(changed("lib/unused.ts")).belongs("notes.test.tsx");
  start().run("notes.test.tsx", ["route/notes"]);
  expect(unknown()).toBe(false);

  start().run("notes.test.tsx", ["route/notes"], { state: "failed" });
  expect(unknown()).toBe(true);

  start().run("notes.test.tsx", ["route/notes"]);
  // Every test skipped, by a bail or a stop.
  start().run("notes.test.tsx", [], { state: "skipped" });
  expect(unknown()).toBe(true);

  start().run("notes.test.tsx", ["route/notes"]);
  start().run("notes.test.tsx", [], { testNamePattern: /one test/ });
  expect(unknown()).toBe(true);

  start().run("notes.test.tsx", ["route/notes"]);
  const { vitest, run } = start();
  // What the `t` key of watch mode sets.
  vitest.getGlobalTestNamePattern = () => /one test/;
  run("notes.test.tsx", []);
  expect(unknown()).toBe(true);

  start().run("notes.test.tsx", ["route/notes"]);
  const tagged = start();
  // `--tags`: the tab leaves out the tests without the tag.
  tagged.tagsFilter.push("smoke");
  tagged.run("notes.test.tsx", []);
  expect(unknown()).toBe(true);
});

test("belongs to what a file like next.config imports, which Vite has no module of", () => {
  fs.writeFileSync(at("next.config.ts"), 'import { settings } from "./next.settings.ts";');
  start().run("notes.test.tsx", ["route/notes"]);

  expect(start(changed("next.settings.ts")).belongs("notes.test.tsx")).toBe(true);
});

test("belongs to the mock of a module that comes after the run", () => {
  start().run("profile.test.tsx", ["route/profile"]);
  expect(start(changed("lib/unused.ts")).belongs("profile.test.tsx")).toBe(false);
  fs.mkdirSync(at("app/profile/__mocks__"));
  fs.writeFileSync(at("app/profile/__mocks__/avatar.tsx"), "");

  expect(start(changed("app/profile/__mocks__/avatar.tsx")).belongs("profile.test.tsx")).toBe(true);
});

test("forgets every test file when a file comes to the app directory, or next to it", () => {
  start().run("notes.test.tsx", ["route/notes"]);
  fs.writeFileSync(at("app/notes/loading.tsx"), "");
  expect(start(changed("lib/unused.ts")).belongs("notes.test.tsx")).toBe(true);
});

test("leaves a test file as it is when Vitest does not look up, and in another environment", () => {
  expect(start().transform("ssr", at("notes.test.tsx"))).toBeUndefined();
  expect(start(changed("lib/db.ts")).transform("client", at("notes.test.tsx"))).toBeUndefined();
  expect(start(changed("lib/db.ts")).transform("ssr", at("lib/db.ts"))).toBeUndefined();
});
