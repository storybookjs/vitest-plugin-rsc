import { normalizePath } from "vite";
import type { TestModule, TestProject, TestSpecification, Vitest } from "vitest/node";

// Every place where this directory leans on how Vitest works inside, rather
// than on something Vitest offers a plugin. An update of Vitest can break
// these without an error, so vitest.test.ts runs each against the real one.

/**
 * Watch mode: calls `prepare` for every file that changes, before Vitest
 * looks up its test files in Vite's module graph.
 *
 * Leans on: `watchTriggerPatterns` is asked first, for every file.
 */
export function beforeWatchLookup(vitest: Vitest, prepare: (file: string) => void): void {
  (vitest.config.watchTriggerPatterns ??= []).push({
    pattern: /./,
    // It returns nothing, so the lookup is still Vitest's.
    testsToRun: (file) => prepare(file),
  });
}

/**
 * `vitest --changed` and `vitest related`: lets `belongs` say whether a test
 * file belongs to the changed files, where Vitest reads that off the imports
 * of the test file. Returns the transform of a plugin, and `forget`, to call
 * before the test files are read for another reason.
 *
 * Leans on:
 * - Vitest transforms each test file in the `ssr` environment to follow its
 *   imports. There the test file is made empty: that environment is none of
 *   the layers, and cannot read a file of the app that needs Next's compiler.
 * - Vitest keeps a test file that is itself in `config.related`, and reads
 *   that list after these transforms. So a test file that belongs is added.
 */
export function answerLookup(
  vitest: Vitest,
  project: TestProject,
  belongs: (testFile: string, changed: ReadonlySet<string>) => boolean,
) {
  // The changed files of a lookup, as they were before test files were added.
  const changes = new WeakMap<string[], Set<string>>();
  const emptied = new Set<string>();

  return {
    transform(environment: string, id: string): { code: string; map: null } | undefined {
      // Vitest sets `related` before it looks up, also for `--changed`.
      const related = vitest.config.related;
      if (environment !== "ssr" || !related || !project.matchesTestGlob(id)) return;
      let changed = changes.get(related);
      if (!changed) changes.set(related, (changed = new Set(related.map(normalizePath))));
      if (belongs(id, changed) && !related.includes(id)) related.push(id);
      emptied.add(id);
      return { code: "export {};\n", map: null };
    },

    /** Vite keeps the result of a transform, and the empty one is only for the lookup. */
    forget(): void {
      const graph = project.vite.environments.ssr?.moduleGraph;
      for (const id of emptied) {
        for (const node of graph?.getModulesByFile(id) ?? []) graph!.invalidateModule(node);
      }
      emptied.clear();
    },
  };
}

/**
 * The runs of the test files of a project.
 *
 * Leans on: Vitest makes its reporters of `config.reporters` after
 * `configureVitest`, and `--tags` is not on the specification.
 */
export function onRuns(
  vitest: Vitest,
  project: TestProject,
  listener: {
    runStart(testFiles: string[]): void;
    /** `complete`: every test of the file ran, and passed. */
    testFileEnd(testFile: string, complete: boolean): void;
    runEnd(): void;
  },
): void {
  // Test files that run in part: a name pattern, a line, a tag.
  const partial = new Set<string>();
  const isFiltered = (spec: TestSpecification) =>
    Boolean(
      spec.testLines?.length ||
      spec.testIds?.length ||
      spec.testNamePattern ||
      spec.testTagsFilter?.length ||
      // The tab filters by it.
      project.config.tagsFilter?.length ||
      vitest.getGlobalTestNamePattern(),
    );

  vitest.config.reporters.push({
    onTestRunStart(specifications: readonly TestSpecification[]) {
      const own = specifications.filter((spec) => spec.project === project);
      partial.clear();
      for (const spec of own) if (isFiltered(spec)) partial.add(spec.moduleId);
      listener.runStart(own.map((spec) => spec.moduleId));
    },
    onTestModuleEnd(module: TestModule) {
      if (module.project !== project) return;
      // Not one with a test that was skipped by a filter, a bail or a stop.
      const complete = module.state() === "passed" && !partial.has(module.moduleId);
      listener.testFileEnd(module.moduleId, complete);
    },
    onTestRunEnd: () => listener.runEnd(),
  } as never);
}
