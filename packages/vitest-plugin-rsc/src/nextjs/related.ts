import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { EnvironmentModuleNode } from "vite";
import type { TestModule, TestProject, TestSpecification, Vitest } from "vitest/node";
import type { RouteKind } from "./watch.ts";

// `vitest --changed` and `vitest related`: which test files a changed file
// belongs to, before anything has run.
//
// Vitest answers that from the imports of each test file: it transforms the
// file in the `ssr` environment, follows the imports that are files of the
// project, and keeps the test files that reach a changed file. That cannot
// work for an app of Next. A test that opens a route with
// `renderServer({ url })` does not import `page.tsx`, and which routes it
// opens is only known once it has run. And the `ssr` environment is none of
// the three layers: it does not have Next's compiler, so it cannot read a
// file of the app that needs it.
//
// A run does know. When a test file has passed, the files it depends on are
// in Vite's module graphs: what it imports, and what the routes it loaded
// import, in each layer. They are written down, and the next lookup gives the
// test file the changed ones among them as imports. Vitest transforms none of
// them: each already has a result, an empty one.
//
// Never too few: a test file that is not written down depends on every file
// of the project. That is a test file that failed, that ran in part, or that
// has not run since a file came to the `app` directory or went, and every
// test file of a checkout without the cache.

type Saved = {
  /** The files of the `app` directory when this was written. */
  app: string;
  /** The files each test file depends on, as paths from the root. */
  files: Record<string, string[]>;
};

// What Vitest's lookup reads of a module it does not have to transform.
const noImports = { code: "", map: null, deps: [], dynamicDeps: [] };

export function createRelatedRoutes(options: {
  /** The Vite environments of the layers. The first has the test files. */
  environments: string[];
  /** The ids of the modules that list the routes: every test file imports them. */
  lists: string[];
  /** The ids of the modules of a route. */
  modulesOf(kind: RouteKind, page: string): string[];
  /** The `app` directory. */
  appDir(): string;
  /** Files that every test file depends on, like `next.config.ts`. */
  shared(): string[];
}) {
  let state:
    | { vitest: Vitest; project: TestProject; root: string; file: string; saved: Saved }
    | undefined;
  // The modules of the routes the test files of this run have loaded so far.
  const loaded = new Map<string, Set<string>>();
  // Test files that run in part: a name pattern, a line, a tag.
  const partial = new Set<string>();
  let isTestFile = (_: string): boolean => false;

  // A file that comes to the `app` directory or goes can change which route a
  // URL gets, and which layouts and boundaries a route has.
  const appFiles = () => {
    const names = fs.readdirSync(options.appDir(), { recursive: true }) as string[];
    return createHash("sha1").update(names.sort().join("\n")).digest("hex");
  };

  const read = (file: string, app: string): Saved => {
    try {
      const saved = JSON.parse(fs.readFileSync(file, "utf8")) as Saved;
      if (saved.app === app && typeof saved.files === "object") return saved;
    } catch {}
    return { app, files: {} };
  };

  const isSource = (file: string | null) =>
    Boolean(file && path.isAbsolute(file) && !file.includes("/node_modules/"));

  /** The files a test file depends on, from the module graphs of the layers. */
  const dependenciesOf = (testFile: string): string[] => {
    const { project, root } = state!;
    const graphs = options.environments.flatMap((name) => {
      const graph = project.vite.environments[name]?.moduleGraph;
      return graph ? [graph] : [];
    });
    const lists = new Set(options.lists);
    const files = new Set<string>();
    const seen = new Set<EnvironmentModuleNode>();
    const queue: EnvironmentModuleNode[] = [...(graphs[0]?.getModulesByFile(testFile) ?? [])];
    for (const id of loaded.get(testFile) ?? []) {
      const route = graphs[0]?.getModuleById(id);
      if (route) queue.push(route);
    }
    for (let node = queue.pop(); node; node = queue.pop()) {
      // Without an id: a file that is only watched, not imported.
      if (seen.has(node) || !node.id) continue;
      seen.add(node);
      // The list imports every route. The ones that count are the loaded ones.
      if (lists.has(node.id)) continue;
      if (node.file?.includes("/node_modules/")) continue;
      if (isSource(node.file) && !files.has(node.file!) && fs.existsSync(node.file!)) {
        files.add(node.file!);
        // A Client Component has its imports in the other layers.
        for (const graph of graphs) queue.push(...(graph.getModulesByFile(node.file!) ?? []));
      }
      queue.push(...node.importedModules);
    }
    for (const file of options.shared()) files.add(file);
    return [...files].map((file) => path.relative(root, file)).sort();
  };

  return {
    /** A route that the test file which runs now has loaded. */
    loaded(testPath: string | undefined, kind: RouteKind, page: string): void {
      if (!testPath) return;
      let routes = loaded.get(testPath);
      if (!routes) loaded.set(testPath, (routes = new Set()));
      for (const id of options.modulesOf(kind, page)) routes.add(id);
    },

    /** Once Vitest has the project. `matches` says what a test file is. */
    start(vitest: Vitest, project: TestProject, matches: (file: string) => boolean): void {
      const root = project.config.root;
      const file = path.join(project.vite.config.cacheDir, "vitest-plugin-rsc", "related.json");
      const saved = read(file, appFiles());
      state = { vitest, project, root, file, saved };
      isTestFile = matches;
      const isFiltered = (spec: TestSpecification) =>
        Boolean(
          spec.testLines?.length ||
          spec.testIds?.length ||
          spec.testNamePattern ||
          spec.testTagsFilter?.length ||
          vitest.config.testNamePattern,
        );

      // After `configureVitest`, Vitest makes its reporters of this list.
      vitest.config.reporters.push({
        onTestRunStart(specifications: readonly TestSpecification[]) {
          for (const spec of specifications) {
            if (spec.project !== project) continue;
            loaded.delete(spec.moduleId);
            if (isFiltered(spec)) partial.add(spec.moduleId);
            else partial.delete(spec.moduleId);
          }
        },
        onTestModuleEnd(module: TestModule) {
          if (module.project !== project) return;
          const name = path.relative(root, module.moduleId);
          if (module.ok() && !partial.has(module.moduleId)) {
            saved.files[name] = dependenciesOf(module.moduleId);
          } else {
            delete saved.files[name];
          }
        },
        onTestRunEnd() {
          saved.app = appFiles();
          fs.mkdirSync(path.dirname(file), { recursive: true });
          fs.writeFileSync(file, `${JSON.stringify(saved)}\n`);
        },
      } as never);
    },

    /**
     * For the transform of a test file in the environment of Vitest's lookup:
     * the changed files it depends on, as imports that never run.
     */
    async imports(environment: string, id: string): Promise<string | undefined> {
      if (environment !== "ssr" || !state || !isTestFile(id)) return;
      const { vitest, project, root, saved } = state;
      // Vitest sets this before it looks up, also for `--changed`.
      const related = vitest.config.related;
      if (!related?.length) return;
      const known = saved.files[path.relative(root, id)];
      const dependencies = known && new Set(known.map((file) => path.join(root, file)));
      const inProject = (file: string) => !path.relative(root, file).startsWith("..");
      const changed = related.filter((file) =>
        dependencies ? dependencies.has(file) : inProject(file) && isSource(file),
      );

      // Vitest follows an import to a module without a result by transforming
      // it, here, without Next's compiler.
      const graph = project.vite.environments.ssr!.moduleGraph;
      for (const file of dependencies ?? changed) {
        if (file === id || !fs.existsSync(file)) continue;
        const node = await graph.ensureEntryFromUrl(file);
        if (node.id === file) node.transformResult ??= noImports as never;
      }
      const imports = changed
        .filter((file) => file !== id && fs.existsSync(file))
        .map((file) => `import(${JSON.stringify(file)})`);
      if (imports.length > 0) return `\n;(() => [${imports.join(", ")}]);\n`;
    },
  };
}
