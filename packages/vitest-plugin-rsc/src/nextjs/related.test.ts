import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import type { TestModule, TestProject, TestSpecification, Vitest } from "vitest/node";
import { createRelatedRoutes } from "./related.ts";

// A project on disk, and Vite's module graphs as far as they are read: a
// module, its file and what it imports.
type Node = { id: string; file: string; importedModules: Set<Node>; transformResult?: unknown };

let root: string;
const at = (file: string) => path.join(root, file);

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "related-"));
  for (const file of [
    "app/notes/page.tsx",
    "app/profile/page.tsx",
    "app/profile/avatar.tsx",
    "app/layout.tsx",
    "lib/db.ts",
    "lib/unused.ts",
    "notes.test.tsx",
    "profile.test.tsx",
    "next.config.ts",
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
    for (const dep of imported) node(id).importedModules.add(node(dep));
  }
  return {
    getModuleById: (id: string) => nodes.get(id),
    getModulesByFile: (file: string) => (nodes.has(file) ? new Set([nodes.get(file)!]) : undefined),
    ensureEntryFromUrl: async (url: string) => node(url),
  };
}

// Vitest with one project, from the start of a process to its lookup.
function start(related?: string[]) {
  const rsc = createGraph({
    [at("notes.test.tsx")]: ["plugin", at("lib/db.ts")],
    [at("profile.test.tsx")]: ["plugin"],
    plugin: ["list"],
    list: ["route/notes", "route/profile"],
    "route/notes": [at("app/notes/page.tsx"), at("app/layout.tsx")],
    "route/profile": [at("app/profile/page.tsx"), at("app/layout.tsx")],
    // A Client Component: in this layer it imports nothing.
    [at("app/profile/page.tsx")]: [],
  });
  const browser = createGraph({ [at("app/profile/page.tsx")]: [at("app/profile/avatar.tsx")] });
  const ssr = createGraph({});
  const routes = createRelatedRoutes({
    environments: ["rsc", "browser"],
    lists: ["list"],
    modulesOf: (_, page) => [`route/${page}`],
    appDir: () => at("app"),
    shared: () => [at("next.config.ts")],
  });
  const vitest = { config: { reporters: [] as unknown[], related } };
  const project = {
    config: { root },
    vite: {
      config: { cacheDir: at("node_modules/.vite") },
      environments: {
        rsc: { moduleGraph: rsc },
        browser: { moduleGraph: browser },
        ssr: { moduleGraph: ssr },
      },
    },
  } as unknown as TestProject;
  routes.start(vitest as unknown as Vitest, project, (file) => file.endsWith(".test.tsx"));
  const reporter = vitest.config.reporters[0] as {
    onTestRunStart(specifications: TestSpecification[]): void;
    onTestModuleEnd(module: TestModule): void;
    onTestRunEnd(): void;
  };
  return {
    ssr,
    /** A run of a test file that loads these routes. */
    run(testFile: string, loads: string[], run: { ok?: boolean; testNamePattern?: RegExp } = {}) {
      const moduleId = at(testFile);
      reporter.onTestRunStart([{ project, moduleId, ...run } as unknown as TestSpecification]);
      for (const page of loads) routes.loaded(moduleId, "page", page);
      reporter.onTestModuleEnd({
        project,
        moduleId,
        ok: () => run.ok ?? true,
      } as unknown as TestModule);
      reporter.onTestRunEnd();
    },
    /** The files Vitest's lookup gets as imports of a test file. */
    async importsOf(testFile: string) {
      const code = (await routes.imports("ssr", at(testFile))) ?? "";
      return [...code.matchAll(/import\("([^"]+)"\)/g)].map(([, file]) =>
        path.relative(root, file!),
      );
    },
  };
}

const changed = (...files: string[]) => files.map(at);

test("a test file that has not run depends on every file of the project", async () => {
  const { importsOf } = start(changed("lib/unused.ts", "app/notes/page.tsx"));

  expect(await importsOf("notes.test.tsx")).toEqual(["lib/unused.ts", "app/notes/page.tsx"]);
});

test("a test file that has run depends on what it imports and on the routes it loaded", async () => {
  start().run("notes.test.tsx", ["notes"]);

  const all = ["app/notes/page.tsx", "app/profile/page.tsx", "app/layout.tsx", "lib/db.ts"];
  const { importsOf } = start(changed(...all, "lib/unused.ts", "next.config.ts"));

  expect(await importsOf("notes.test.tsx")).toEqual([
    "app/notes/page.tsx",
    "app/layout.tsx",
    "lib/db.ts",
    "next.config.ts",
  ]);
});

test("follows a Client Component into the layer that has its imports", async () => {
  start().run("profile.test.tsx", ["profile"]);

  const { importsOf } = start(changed("app/profile/avatar.tsx", "app/notes/page.tsx"));

  expect(await importsOf("profile.test.tsx")).toEqual(["app/profile/avatar.tsx"]);
});

test("gives a file that Vitest would follow an empty result, so it is not transformed", async () => {
  start().run("notes.test.tsx", ["notes"]);

  const { importsOf, ssr } = start(changed("app/notes/page.tsx"));
  await importsOf("notes.test.tsx");

  expect(ssr.getModuleById(at("app/notes/page.tsx"))?.transformResult).toMatchObject({ deps: [] });
  expect(ssr.getModuleById(at("lib/db.ts"))?.transformResult).toMatchObject({ deps: [] });
});

test("forgets a test file that failed, or that ran in part", async () => {
  start().run("notes.test.tsx", ["notes"]);
  start().run("notes.test.tsx", ["notes"], { ok: false });
  expect(await start(changed("lib/unused.ts")).importsOf("notes.test.tsx")).toEqual([
    "lib/unused.ts",
  ]);

  start().run("notes.test.tsx", ["notes"]);
  start().run("notes.test.tsx", [], { testNamePattern: /one test/ });
  expect(await start(changed("lib/unused.ts")).importsOf("notes.test.tsx")).toEqual([
    "lib/unused.ts",
  ]);
});

test("forgets every test file when a file comes to the app directory", async () => {
  start().run("notes.test.tsx", ["notes"]);
  fs.writeFileSync(at("app/notes/loading.tsx"), "");

  const { importsOf } = start(changed("lib/unused.ts"));

  expect(await importsOf("notes.test.tsx")).toEqual(["lib/unused.ts"]);
});

test("adds nothing when Vitest does not look up", async () => {
  expect(await start().importsOf("notes.test.tsx")).toEqual([]);
});
