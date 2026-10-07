import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { normalizePath, type EnvironmentModuleGraph, type EnvironmentModuleNode } from "vite";
import type { TestModule, TestProject, TestSpecification, Vitest } from "vitest/node";

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
// in Vite's module graphs: what it and the setup files import, and what the
// routes it loaded import, in each layer. They are written down, each with a
// hash of what was in it. At the next lookup the plugin answers for a test
// file itself: it belongs to the change when one of its files is a changed
// one, or is no longer what it was.
//
// Never too few: a test file that is not written down belongs to every
// change. That is a test file that did not pass, that ran in part, or that
// has not run since a file came to the `app` directory or went, and every
// test file of a checkout without the cache.

type Saved = {
  /** The names of the files that say which routes there are, hashed. */
  routes: string;
  /** The files each test file depends on, by their path from the root, with a hash. */
  files: Record<string, Record<string, string>>;
};

type Options = {
  /** The Vite environments of the layers. The first has the test files. */
  environments: string[];
  /** The ids of the modules that list the routes: every test file imports them. */
  lists: string[];
  /** The `app` directory. */
  appDir(): string;
  /**
   * Files of the project that every test file depends on and that no module
   * imports, like `next.config.ts`.
   */
  shared(): string[];
};

const stylesheet = /\.(css|scss|sass|less|styl|stylus|pcss|postcss)$/;

export function createRelatedRoutes(options: Options) {
  const projects: ReturnType<typeof createProject>[] = [];

  return {
    /**
     * A module that the test file which runs now has loaded without an import
     * of its own: of a route, or of a Server Action. By its id, its file or
     * its URL.
     */
    loaded(testPath: string | undefined, modules: string[]): void {
      if (testPath) for (const project of projects) project.loaded(testPath, modules);
    },

    /** Once Vitest has the project. `matches` says what a test file is. */
    start(vitest: Vitest, project: TestProject, matches: (file: string) => boolean): void {
      projects.push(createProject(options, vitest, project, matches));
    },

    /**
     * The transform of a test file in the environment of Vitest's lookup. The
     * plugin has looked it up itself, so the test file has no imports to
     * follow, into files this environment cannot read.
     */
    lookup(environment: string, id: string): { code: string; map: null } | undefined {
      if (environment !== "ssr") return;
      const lookups = projects.filter((project) => project.isLookup(id));
      if (lookups.length === 0) return;
      for (const project of lookups) project.lookup(id);
      return { code: "export {};\n", map: null };
    },
  };
}

function createProject(
  options: Options,
  vitest: Vitest,
  project: TestProject,
  isTestFile: (file: string) => boolean,
) {
  const root = normalizePath(project.config.root);
  const relative = (file: string) => normalizePath(path.relative(root, file));
  const absolute = (file: string) => normalizePath(path.resolve(root, file));
  const name = project.name.replace(/[^\w.-]+/g, "_") || "default";
  const cache = path.join(
    project.vite.config.cacheDir,
    "vitest-plugin-rsc",
    `related-${name}.json`,
  );

  const hashes = new Map<string, string | undefined>();
  /** What is in a file, or nothing for a file that is gone. */
  const hashOf = (file: string) => {
    if (!hashes.has(file)) {
      let hash: string | undefined;
      try {
        hash = createHash("sha1").update(fs.readFileSync(file)).digest("hex");
      } catch {}
      hashes.set(file, hash);
    }
    return hashes.get(file);
  };

  // A file that comes or goes here can change which route a URL gets, and
  // which layouts and boundaries a route has, without a change to a file that
  // is written down.
  const routeFiles = () => {
    const names = fs.readdirSync(options.appDir(), { recursive: true }) as string[];
    const shared = options.shared().map(relative);
    return createHash("sha1")
      .update([...names.map(normalizePath).sort(), ...shared.sort()].join("\n"))
      .digest("hex");
  };

  const read = (): Saved => {
    const routes = routeFiles();
    try {
      const saved = JSON.parse(fs.readFileSync(cache, "utf8")) as Saved;
      if (saved.routes === routes && typeof saved.files === "object") return saved;
    } catch {}
    return { routes, files: {} };
  };
  const saved = read();

  // The modules the test files of this run have loaded so far.
  const loaded = new Map<string, Set<string>>();
  // Test files that run in part: a name pattern, a line, a tag.
  const partial = new Set<string>();
  // Test files written down in this run.
  const written = new Set<string>();

  const graphs = () =>
    [...options.environments, "__vitest__"].flatMap((environment) => {
      const graph = project.vite.environments[environment]?.moduleGraph;
      return graph ? [graph] : [];
    });

  const nodesOf = (graph: EnvironmentModuleGraph, module: string) => {
    const byId = graph.getModuleById(module) ?? graph.urlToModuleMap.get(module);
    if (byId) return [byId];
    return [
      ...(graph.getModulesByFile(module) ?? []),
      ...(graph.getModulesByFile(absolute(module.replace(/^\/+/, ""))) ?? []),
    ];
  };

  /** The files a test file depends on, from the module graphs. */
  const dependenciesOf = (testFile: string): string[] => {
    const all = graphs();
    const lists = new Set(options.lists);
    const files = new Set<string>();
    const seen = new Set<EnvironmentModuleNode>();
    const queue: EnvironmentModuleNode[] = [];
    const addFile = (file: string) => {
      if (files.has(file) || !fs.existsSync(file)) return;
      files.add(file);
      // A Client Component has its imports in the other layers.
      for (const graph of all) queue.push(...(graph.getModulesByFile(file) ?? []));
      // Vitest loads a mock from here in place of the file.
      addFile(path.posix.join(path.posix.dirname(file), "__mocks__", path.posix.basename(file)));
    };
    for (const file of [
      testFile,
      ...project.config.setupFiles,
      ...[project.config.globalSetup ?? []].flat(),
      ...options.shared(),
    ]) {
      addFile(normalizePath(file));
    }
    for (const id of loaded.get(testFile) ?? []) {
      for (const graph of all) queue.push(...nodesOf(graph, id));
    }
    for (let node = queue.pop(); node; node = queue.pop()) {
      if (seen.has(node)) continue;
      seen.add(node);
      const file = node.file && path.isAbsolute(node.file) ? normalizePath(node.file) : undefined;
      if (!node.id) {
        // A file that is only watched. A stylesheet that another one imports
        // is one. So is every file Tailwind scans, which no test depends on.
        if (file && stylesheet.test(file)) addFile(file);
        continue;
      }
      // The list imports every route. The ones that count are the loaded ones.
      if (lists.has(node.id) || file?.includes("/node_modules/")) continue;
      if (file) addFile(file);
      queue.push(...node.importedModules);
    }
    return [...files];
  };

  const isFiltered = (spec: TestSpecification) =>
    Boolean(
      spec.testLines?.length ||
      spec.testIds?.length ||
      spec.testNamePattern ||
      spec.testTagsFilter?.length ||
      vitest.getGlobalTestNamePattern(),
    );

  // After `configureVitest`, Vitest makes its reporters of this list.
  vitest.config.reporters.push({
    onTestRunStart(specifications: readonly TestSpecification[]) {
      hashes.clear();
      written.clear();
      for (const spec of specifications) {
        if (spec.project !== project) continue;
        loaded.delete(spec.moduleId);
        if (isFiltered(spec)) partial.add(spec.moduleId);
        else partial.delete(spec.moduleId);
      }
    },
    onTestModuleEnd(module: TestModule) {
      if (module.project !== project) return;
      const testFile = relative(module.moduleId);
      // Not one with a test that was skipped by a filter, a bail or a stop.
      if (module.state() !== "passed" || partial.has(module.moduleId)) {
        delete saved.files[testFile];
        return;
      }
      saved.files[testFile] = Object.fromEntries(
        dependenciesOf(module.moduleId)
          .sort()
          .flatMap((file) => {
            const hash = hashOf(file);
            return hash ? [[relative(file), hash]] : [];
          }),
      );
      written.add(testFile);
    },
    onTestRunEnd() {
      const routes = routeFiles();
      if (routes !== saved.routes) {
        for (const testFile of Object.keys(saved.files)) {
          if (!written.has(testFile)) delete saved.files[testFile];
        }
        saved.routes = routes;
      }
      // Whole or not at all: another run may read it now.
      fs.mkdirSync(path.dirname(cache), { recursive: true });
      const temporary = `${cache}.${process.pid}.tmp`;
      fs.writeFileSync(temporary, `${JSON.stringify(saved)}\n`);
      fs.renameSync(temporary, cache);
    },
  } as never);

  // The changed files Vitest looks up, as it had them before the plugin
  // added to them.
  const changes = new WeakMap<string[], Set<string>>();

  return {
    loaded(testPath: string, modules: string[]) {
      let all = loaded.get(testPath);
      if (!all) loaded.set(testPath, (all = new Set()));
      for (const id of modules) all.add(id);
    },

    /** Whether Vitest is looking up the test files of a change, and this is one. */
    isLookup: (id: string) => Boolean(vitest.config.related) && isTestFile(id),

    lookup(id: string) {
      // Vitest sets this before it looks up, also for `--changed`.
      const related = vitest.config.related!;
      let changed = changes.get(related);
      if (!changed) changes.set(related, (changed = new Set(related.map(normalizePath))));
      hashes.clear();

      const files = saved.files[relative(id)];
      const belongs = files
        ? Object.entries(files).some(
            ([file, hash]) => changed.has(absolute(file)) || hashOf(absolute(file)) !== hash,
          )
        : // Another test file that changed runs on its own account.
          [...changed].some((file) => !isTestFile(file));
      // Vitest keeps a test file that is itself in the list, and it reads the
      // list after the transform of the test files.
      if (belongs && !related.includes(id)) related.push(id);
    },
  };
}
