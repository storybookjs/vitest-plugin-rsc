import fs from "node:fs";
import path from "node:path";
import { normalizePath } from "vite";
import type { TestProject, Vitest } from "vitest/node";
import { filesReachedFrom, modulesNamed, projectFiles, withImports } from "./dependencies.ts";
import { fileHashes, hashOf, openRecord } from "./record.ts";
import { answerLookup, onRuns } from "./vitest.ts";

// `vitest --changed` and `vitest related`: which test files a changed file
// belongs to, before anything has run.
//
// Vitest answers that from the imports of each test file. That cannot work
// for an app of Next: a test that opens a route with `renderServer({ url })`
// does not import `page.tsx`, and which routes it opens is only known once it
// has run.
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

export function relatedLookup(
  vitest: Vitest,
  project: TestProject,
  options: {
    /** The Vite environments of the layers. */
    environments: string[];
    /** The ids of the modules that list the routes: every test file imports them. */
    lists: string[];
    /** The project of Next. */
    next(): { root: string; appDir: string };
  },
) {
  const root = normalizePath(project.config.root);
  const relative = (file: string) => normalizePath(path.relative(root, file));
  const absolute = (file: string) => normalizePath(path.resolve(root, file));

  const name = project.name.replace(/[^\w.-]+/g, "_") || "default";
  const record = openRecord(
    path.join(project.vite.config.cacheDir, "vitest-plugin-rsc", `related-${name}.json`),
    () => {
      const routes = fs.readdirSync(options.next().appDir, { recursive: true }) as string[];
      const shared = projectFiles(options.next()).map(relative);
      return hashOf([...routes.map(normalizePath).sort(), ...shared.sort()].join("\n"));
    },
  );

  // The modules the test files of this run have loaded so far.
  const loaded = new Map<string, Set<string>>();
  // Of this run, or of this lookup.
  let hash = fileHashes();

  const dependenciesOf = (testFile: string): string[] => {
    // Vitest's own environment has the global setup.
    const graphs = [...options.environments, "__vitest__"].flatMap((environment) => {
      const graph = project.vite.environments[environment]?.moduleGraph;
      return graph ? [graph] : [];
    });
    const lists = new Set(options.lists);
    return filesReachedFrom(
      graphs,
      {
        files: [
          testFile,
          ...project.config.setupFiles,
          ...[project.config.globalSetup ?? []].flat(),
          ...withImports(projectFiles(options.next())),
        ],
        modules: [...(loaded.get(testFile) ?? [])].flatMap((module) =>
          graphs.flatMap((graph) => modulesNamed(graph, module, root)),
        ),
      },
      // The list imports every route. The ones that count are the loaded ones.
      (id) => lists.has(id),
    );
  };

  let lookedUp: ReadonlySet<string> | undefined;
  const lookup = answerLookup(vitest, project, (testFile, changed) => {
    if (changed !== lookedUp) hash = fileHashes();
    lookedUp = changed;
    const files = record.of(relative(testFile));
    // Not written down. Another test file that changed runs on its own account.
    if (!files) return [...changed].some((file) => !project.matchesTestGlob(file));
    return Object.entries(files).some(
      ([file, was]) => changed.has(absolute(file)) || hash(absolute(file)) !== was,
    );
  });

  onRuns(vitest, project, {
    runStart(testFiles) {
      lookup.forget();
      hash = fileHashes();
      record.check();
      for (const testFile of testFiles) loaded.delete(testFile);
    },
    testFileEnd(testFile, complete) {
      const files = complete ? dependenciesOf(testFile).sort() : undefined;
      record.set(
        relative(testFile),
        files && Object.fromEntries(files.map((file) => [relative(file), hash(file)])),
      );
    },
    runEnd: () => record.save(),
  });

  return {
    /**
     * Modules that a test file has loaded without an import of its own: of a
     * route, or of a Server Action. Each by its id, its file or its URL.
     */
    loaded(testFile: string, modules: string[]): void {
      let all = loaded.get(testFile);
      if (!all) loaded.set(testFile, (all = new Set()));
      for (const id of modules) all.add(id);
    },
    transform: lookup.transform,
  };
}
