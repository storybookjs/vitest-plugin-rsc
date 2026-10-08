import { createFilter, normalizePath, type Plugin } from "vite";
import type { TestProject, Vitest } from "vitest/node";
import { loadedCommand, type LoadedKind } from "./command.ts";
import { relatedLookup } from "./related.ts";
import { watchMode } from "./watch.ts";

// Which test files belong to a file that changed.
//
// Vitest reads that off the imports of a test file, and a test that opens a
// route with `renderServer({ url })` does not import the files of the route.
// So the tab says what a test file loads (tab.ts), and this plugin uses that
// twice:
//
//   watch.ts    watch mode: an edit runs the test files that loaded the file
//   related.ts  `vitest --changed` and `vitest related`: the same, between
//               runs, from what the last run wrote down
//
// Both are an addition to Vitest's lookup, not a part of how a route runs,
// and off unless the `affectedTests` option of the plugin is set. Without
// this directory every test passes as before, an edit in watch mode
// runs every test file that opens a route, and `--changed` does not find the
// test files of a route. To take it out:
//
//   - remove this directory;
//   - in ../plugin.ts, remove `affectedTests()` from the plugins, and the
//     option of that name;
//   - in ../rsc.ts, remove the calls of `reportLoaded()`;
//   - in docs/next-routes.md, remove "Watch Mode", and in the README the two
//     entries that point to it;
//   - remove `affectedTests: true` from the configs of the playgrounds.
//
// What is written down stays behind in Vite's cache directory, as
// `vitest-plugin-rsc/related-<project>.json`.
//
// To take out only watch mode, or only `--changed`, remove its line in
// `configureVitest` below. What leans on the inside of Vitest is in
// vitest.ts, and nowhere else.

export type AffectedTestsOptions = {
  /** The Vite environments of the layers. The first has the test files. */
  environments: string[];
  /** The ids of the modules that list the routes: every test file imports them. */
  lists: string[];
  /** The ids of the modules of a route, in the first environment. */
  modulesOf(kind: "page" | "route", entry: string): string[];
  /** The project of Next. */
  next(): { root: string; appDir: string };
};

type Part = {
  loaded(testFile: string, modules: string[]): void;
  transform?(environment: string, id: string): { code: string; map: null } | undefined;
};

export function affectedTests(options: AffectedTestsOptions): Plugin {
  // Per project of Vitest that has this plugin.
  const parts: Part[] = [];

  return {
    name: "vitest-plugin-rsc:next-affected-tests",
    enforce: "pre",
    config(config) {
      const test = ((
        config as { test?: { browser?: { commands?: Record<string, unknown> } } }
      ).test ??= {});
      // Here, and not later: Vitest lists the commands for the tab when the
      // project starts.
      ((test.browser ??= {}).commands ??= {})[loadedCommand] = (
        { testPath }: { testPath: string | undefined },
        kind: LoadedKind,
        id: string,
      ) => {
        if (!testPath) return;
        // The id of a Server Action starts with its module.
        const modules = kind === "action" ? [id] : options.modulesOf(kind, id);
        for (const part of parts) part.loaded(normalizePath(testPath), modules);
      };
    },
    // Vitest's hook for a plugin of a project.
    configureVitest({ vitest, project }: { vitest: Vitest; project: TestProject }) {
      const [environment] = options.environments;
      const { include, exclude, dir, root } = project.config;
      // `test.include`, matched the way Vitest does. Not `includeSource`: a
      // file with tests in its source is a file of the app.
      const isTestFile = createFilter(include, exclude, { resolve: dir || root });
      parts.push(watchMode(vitest, project, { environment: environment!, lists: options.lists }));
      parts.push(relatedLookup(vitest, project, { ...options, isTestFile }));
    },
    transform(_, id) {
      const file = id.split("?")[0]!;
      // Each part is asked: one that answers has also told Vitest.
      const answers = parts.map((part) => part.transform?.(this.environment.name, file));
      return answers.find(Boolean);
    },
  } as Plugin;
}
