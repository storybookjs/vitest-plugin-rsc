import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import type { Plugin } from "vite";
import { createVitest, type TestProject, type Vitest } from "vitest/node";
import { answerLookup, beforeWatchLookup, onRuns } from "./vitest.ts";

// The real Vitest, with a project of two test files that import nothing.
// What vitest.ts leans on is not something Vitest promises, so this is where
// an update of Vitest that changes it shows.

let root: string;
const at = (file: string) => path.join(root, file);
let vitest: Vitest | undefined;

beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "affected-")));
  const body = 'import { test } from "vitest";\ntest("one", () => {});\ntest("two", () => {});\n';
  for (const file of ["a.test.ts", "b.test.ts"]) fs.writeFileSync(at(file), body);
  fs.writeFileSync(at("changed.ts"), "");
});

afterEach(async () => {
  await vitest?.close();
  vitest = undefined;
  fs.rmSync(root, { recursive: true });
});

type Hooks = {
  configureVitest(context: { vitest: Vitest; project: TestProject }): void;
  transform?(environment: string, id: string): { code: string; map: null } | undefined;
};

const plugin = (hooks: Hooks) =>
  ({
    name: "affected",
    enforce: "pre",
    configureVitest: hooks.configureVitest,
    transform(_, id) {
      return hooks.transform?.(this.environment.name, id);
    },
  }) as Plugin;

async function start(options: { related?: string[]; watch?: boolean }, hooks?: Hooks) {
  vitest = await createVitest(
    "test",
    { root, config: false, include: ["*.test.ts"], watch: false, reporters: [{}], ...options },
    { plugins: hooks && [plugin(hooks)] },
  );
  return vitest;
}

const isTestFile = (file: string) => file.endsWith(".test.ts");

const relevant = async (vitest: Vitest) =>
  (await vitest.getRelevantTestSpecifications()).map((spec) => path.basename(spec.moduleId)).sort();

test("Vitest finds no test file for a changed file that none imports", async () => {
  expect(await relevant(await start({ related: [at("changed.ts")] }))).toEqual([]);
});

test("answerLookup: Vitest keeps the test files that belong, and reads none of them", async () => {
  // A test file that the lookup environment cannot read.
  fs.writeFileSync(at("b.test.ts"), "this is not < a module");
  let lookup: ReturnType<typeof answerLookup>;
  const asked: string[] = [];
  const vitest = await start(
    { related: [at("changed.ts")] },
    {
      configureVitest({ vitest, project }) {
        lookup = answerLookup(vitest, project, isTestFile, (testFile, changed) => {
          asked.push(
            `${path.basename(testFile)} for ${[...changed].map((file) => path.basename(file)).join()}`,
          );
          return testFile.endsWith("a.test.ts");
        });
      },
      transform: (environment, id) => lookup.transform(environment, id),
    },
  );

  expect(await relevant(vitest)).toEqual(["a.test.ts"]);
  // Each with the changed files as they were, not with the test file added.
  expect(asked.toSorted()).toEqual(["a.test.ts for changed.ts", "b.test.ts for changed.ts"]);
});

test("answerLookup: after forget, a test file is read as it is", async () => {
  let lookup: ReturnType<typeof answerLookup>;
  let project: TestProject;
  const vitest = await start(
    { related: [at("changed.ts")] },
    {
      configureVitest(context) {
        project = context.project;
        lookup = answerLookup(context.vitest, project, isTestFile, () => true);
      },
      transform: (environment, id) => lookup.transform(environment, id),
    },
  );
  await relevant(vitest);
  const read = async () =>
    (await project.vite.environments.ssr!.transformRequest(at("a.test.ts")))!;
  expect((await read()).code).not.toContain("one");

  // What Vitest's command line does after the run.
  vitest.config.related = undefined;
  lookup!.forget();

  expect((await read()).code).toContain("one");
});

test("onRuns: says when a test file ran whole, and when in part", async () => {
  const calls: unknown[] = [];
  const vitest = await start(
    {},
    {
      configureVitest({ vitest, project }) {
        onRuns(vitest, project, {
          runStart: (testFiles) =>
            calls.push(["runStart", testFiles.map((file) => path.basename(file))]),
          testFileEnd: (testFile, complete) =>
            calls.push(["testFileEnd", path.basename(testFile), complete]),
          runEnd: () => calls.push(["runEnd"]),
        });
      },
    },
  );

  await vitest.start(["a.test.ts"]);
  expect(calls).toEqual([
    ["runStart", ["a.test.ts"]],
    ["testFileEnd", "a.test.ts", true],
    ["runEnd"],
  ]);

  calls.length = 0;
  vitest.setGlobalTestNamePattern("one");
  await vitest.rerunTestSpecifications(await vitest.globTestSpecifications(["a.test.ts"]));
  expect(calls).toContainEqual(["testFileEnd", "a.test.ts", false]);
});

test("onRuns: a test file of a run that was cut short is not complete", async () => {
  const ended: boolean[] = [];
  const vitest = await start(
    {},
    {
      configureVitest({ vitest, project }) {
        onRuns(vitest, project, {
          runStart() {},
          testFileEnd: (_, complete) => ended.push(complete),
          runEnd() {},
        });
        // What a bail does, and the `q` key: the tests that are left are
        // skipped, and the file still passes.
        vitest.config.reporters.push({
          onTestCaseResult: () => void vitest.cancelCurrentRun("test-failure"),
        } as never);
      },
    },
  );

  await vitest.start(["a.test.ts"]);

  expect(ended.at(-1)).toBe(false);
});

test("beforeWatchLookup: is asked before Vitest looks up the test files of a change", async () => {
  // Both test files import one module.
  fs.writeFileSync(at("shared.ts"), "export {};\n");
  for (const file of ["a.test.ts", "b.test.ts"]) {
    fs.writeFileSync(at(file), `import "./shared.ts";\n${fs.readFileSync(at(file), "utf8")}`);
  }
  const asked: string[] = [];
  const runs: string[][] = [];
  const vitest = await start(
    { watch: true },
    {
      configureVitest({ vitest, project }) {
        onRuns(vitest, project, {
          runStart: (testFiles) => runs.push(testFiles.map((file) => path.basename(file)).sort()),
          testFileEnd() {},
          runEnd() {},
        });
        beforeWatchLookup(vitest, (file) => {
          asked.push(path.basename(file));
          // In time for the lookup: one of the two no longer imports it.
          for (const { moduleGraph } of Object.values(project.vite.environments)) {
            for (const shared of moduleGraph.getModulesByFile(at("shared.ts")) ?? []) {
              for (const test of moduleGraph.getModulesByFile(at("a.test.ts")) ?? []) {
                shared.importers.delete(test);
              }
            }
          }
        });
      },
    },
  );
  await vitest.start();
  expect(runs).toEqual([["a.test.ts", "b.test.ts"]]);

  // Until a run of its own: the watcher also finds the files of the project
  // when it starts, and a test file it finds runs again on its own account.
  // Without the hook, no run for this module is of one test file.
  await expect
    .poll(
      () => {
        vitest.vite.watcher.emit("change", at("shared.ts"));
        return runs.at(-1);
      },
      { interval: 500, timeout: 20_000 },
    )
    .toEqual(["b.test.ts"]);
  expect(asked).toContain("shared.ts");
}, 30_000);
