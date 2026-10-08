import fs from "node:fs";
import type { Reporter, TestCase, TestModule, TestSuite } from "vitest/node";

// What one run of a fixture comes to, for `run.ts`: every test with how it
// ended, and what went wrong outside of a test.

export type ReportedTest = {
  /** The test file, relative to the fixture. */
  file: string;
  /** The names of the `describe` blocks and of the test, joined by " > ". */
  name: string;
  state: "passed" | "failed" | "skipped";
  /** Why it failed, or the note of a skip. */
  message?: string;
  duration?: number;
};

export type Report = {
  /** Whether the run got to its end. Without it, the tests are the ones that ended before it stopped. */
  finished: boolean;
  tests: ReportedTest[];
  /** Test files that did not load. */
  errors: { file: string; message: string }[];
};

const messageOf = (error: { message?: string; name?: string } | undefined) =>
  String(error?.message ?? error?.name ?? "unknown error").trim();

// A hook of a `describe` that fails takes its tests with it: they do not run.
function hookError(test: TestCase): string | undefined {
  for (let parent: TestSuite | TestModule = test.parent; ; parent = parent.parent) {
    const [error] = parent.errors();
    if (error) return messageOf(error);
    if (parent.type === "module") return;
  }
}

function reported(test: TestCase): ReportedTest {
  const file = test.module.relativeModuleId;
  const name = test.fullName;
  const result = test.result();
  const duration = test.diagnostic()?.duration;
  // A test under a `// @gate` of Next that does not hold for this run: Next
  // expects it to fail, and shim/gate.ts has Vitest expect the same. So it
  // "passes" when it fails, which is no pass of the plugin.
  if (test.options.fails) {
    return result.state === "failed"
      ? {
          file,
          name,
          state: "failed",
          message: `Gated test passed unexpectedly: its \`// @gate\` does not hold for this run, so Next expects it to fail.`,
        }
      : {
          file,
          name,
          state: "skipped",
          message: "A `// @gate` of Next does not hold for this run: the test is expected to fail.",
        };
  }
  if (result.state === "passed") return { file, name, state: "passed", duration };
  if (result.state === "failed") {
    return { file, name, state: "failed", message: messageOf(result.errors?.[0]), duration };
  }
  // A test that was to run and did not: a hook of its `describe` failed.
  const failedHook =
    test.options.mode === "run" && result.state === "skipped" && !result.note
      ? hookError(test)
      : undefined;
  return failedHook
    ? { file, name, state: "failed", message: failedHook }
    : {
        file,
        name,
        state: "skipped",
        message: result.state === "skipped" ? result.note : undefined,
      };
}

export class ConformanceReporter implements Reporter {
  private readonly file: string;
  private readonly ended: ReportedTest[] = [];

  constructor(file: string) {
    this.file = file;
  }

  // In one step: the runner stops a fixture that takes too long, at any moment.
  private write(report: Report): void {
    fs.writeFileSync(`${this.file}.part`, JSON.stringify(report, null, 2));
    fs.renameSync(`${this.file}.part`, this.file);
  }

  // As it goes: a fixture that hangs is stopped by the runner, and what it
  // found until then still counts.
  onTestCaseResult(test: TestCase): void {
    this.ended.push(reported(test));
    this.write({ finished: false, tests: this.ended, errors: [] });
  }

  onTestRunEnd(modules: ReadonlyArray<TestModule>): void {
    const report: Report = { finished: true, tests: [], errors: [] };
    for (const testModule of modules) {
      const tests = Array.from(testModule.children.allTests());
      if (tests.length === 0) {
        const [error] = testModule.errors();
        report.errors.push({
          file: testModule.relativeModuleId,
          message: error ? messageOf(error) : "the file has no tests",
        });
      }
      report.tests.push(...tests.map(reported));
    }
    this.write(report);
  }
}
