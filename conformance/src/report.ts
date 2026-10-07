import fs from "node:fs";
import { areas, type Fixture } from "./fixtures.ts";

// What a run comes to next to `expectations.json`, the file that says which
// tests fail and why. A test that fails without being in it, or passes while
// it is, is what a run is for: it fails the run.

export type TestRun = {
  /** The test file and the names of the `describe` blocks and of the test, joined by " > ". */
  id: string;
  state: "passed" | "failed" | "skipped";
  message?: string;
  /** What the runner could not give the test, when that is why it failed. */
  unsupported?: string;
  duration?: number;
};

export type FixtureRun = {
  fixture: Fixture;
  duration: number;
  /** Why the fixture, or a test file of it, did not get to its tests. */
  failure?: string;
  tests: TestRun[];
};

export const categories = ["plugin-bug", "not-yet", "not-applicable", "untriaged"] as const;
export type Category = (typeof categories)[number];

// As the headings of the document have them.
const headings: Record<Category, string> = {
  "plugin-bug": "A Bug In The Plugin",
  "not-yet": "Not Yet",
  "not-applicable": "Not Applicable",
  untriaged: "Not Looked At Yet",
};

export type Reason = {
  category: Category;
  text: string;
  /**
   * A regular expression for the message of a failure. `--update` gives a new
   * failure the first reason that matches it.
   */
  match?: string;
};

export type Expectations = {
  reasons: Record<string, Reason>;
  /** Per fixture: the tests that fail, each with the key of its reason. */
  fixtures: Record<string, Record<string, string>>;
};

const untriaged = "untriaged";

export function readExpectations(file: string): Expectations {
  const expectations = JSON.parse(fs.readFileSync(file, "utf8")) as Expectations;
  for (const [fixture, tests] of Object.entries(expectations.fixtures)) {
    for (const [test, reason] of Object.entries(tests)) {
      if (!expectations.reasons[reason]) {
        throw new Error(
          `expectations.json: ${fixture} > ${test} has the reason "${reason}", which is not in "reasons".`,
        );
      }
    }
  }
  return expectations;
}

export function writeExpectations(file: string, expectations: Expectations): void {
  fs.writeFileSync(file, `${JSON.stringify(expectations, null, 2)}\n`);
}

function reasonFor(expectations: Expectations, test: TestRun): string {
  const message = test.unsupported ?? test.message ?? "";
  for (const [key, reason] of Object.entries(expectations.reasons)) {
    if (reason.match && new RegExp(reason.match, "i").test(message)) return key;
  }
  return untriaged;
}

/** The expectations as the runs say they are. A test that still fails keeps its reason. */
export function updateExpectations(expectations: Expectations, runs: FixtureRun[]): Expectations {
  const fixtures = { ...expectations.fixtures };
  for (const run of runs) {
    const before = fixtures[run.fixture.id] ?? {};
    const failing = run.tests
      .filter((test) => test.state === "failed")
      .map((test) => {
        const known = before[test.id];
        return [
          test.id,
          known && known !== untriaged ? known : reasonFor(expectations, test),
        ] as const;
      });
    if (failing.length > 0) fixtures[run.fixture.id] = Object.fromEntries(failing);
    else delete fixtures[run.fixture.id];
  }
  // The reason of a failure that nobody has looked at is there while one has it.
  const { [untriaged]: _, ...reasons } = expectations.reasons;
  const isUsed = Object.values(fixtures).some((tests) => Object.values(tests).includes(untriaged));
  return {
    reasons: isUsed
      ? { ...reasons, [untriaged]: { category: "untriaged", text: "Not looked at yet." } }
      : reasons,
    fixtures,
  };
}

export type Verdict = {
  fixture: Fixture;
  test: TestRun;
  kind: "passed" | "skipped" | "expected-failure" | "unexpected-failure" | "unexpected-pass";
  /** The key of the reason, for a failure that is expected. */
  reason?: string;
};

export type Comparison = {
  expectations: Expectations;
  verdicts: Verdict[];
  unexpected: string[];
};

export function compare(expectations: Expectations, runs: FixtureRun[]): Comparison {
  const verdicts: Verdict[] = [];
  const unexpected: string[] = [];
  for (const { fixture, tests } of runs) {
    const expected = expectations.fixtures[fixture.id] ?? {};
    const seen = new Set<string>();
    for (const test of tests) {
      seen.add(test.id);
      const reason = expected[test.id];
      if (test.state === "failed") {
        verdicts.push({
          fixture,
          test,
          kind: reason ? "expected-failure" : "unexpected-failure",
          reason,
        });
        if (!reason) {
          unexpected.push(
            `FAILED, and expectations.json does not say so: ${fixture.id} > ${test.id}\n    ${(test.message ?? "").split("\n")[0]}`,
          );
        }
      } else if (reason) {
        verdicts.push({
          fixture,
          test,
          kind: test.state === "passed" ? "unexpected-pass" : "skipped",
        });
        unexpected.push(
          test.state === "passed"
            ? `PASSED, and expectations.json says it fails (${reason}): ${fixture.id} > ${test.id}`
            : `SKIPPED, and expectations.json says it fails (${reason}): ${fixture.id} > ${test.id}`,
        );
      } else {
        verdicts.push({ fixture, test, kind: test.state });
      }
    }
    for (const id of Object.keys(expected)) {
      if (!seen.has(id))
        unexpected.push(`NOT RUN, and expectations.json says it fails: ${fixture.id} > ${id}`);
    }
  }
  return { expectations, verdicts, unexpected };
}

type Counts = Record<"passed" | "skipped" | Category, number>;

function count(comparison: Comparison, of: (verdict: Verdict) => boolean = () => true): Counts {
  const counts: Counts = {
    passed: 0,
    skipped: 0,
    "plugin-bug": 0,
    "not-yet": 0,
    "not-applicable": 0,
    untriaged: 0,
  };
  for (const verdict of comparison.verdicts.filter(of)) {
    if (verdict.kind === "passed" || verdict.kind === "unexpected-pass") counts.passed++;
    else if (verdict.kind === "skipped") counts.skipped++;
    else
      counts[
        comparison.expectations.reasons[verdict.reason ?? untriaged]?.category ?? "untriaged"
      ]++;
  }
  return counts;
}

const percent = (part: number, whole: number) =>
  whole === 0 ? "n/a" : `${Math.round((part / whole) * 100)}%`;

function score(counts: Counts) {
  const failed =
    counts["plugin-bug"] + counts["not-yet"] + counts["not-applicable"] + counts.untriaged;
  const run = counts.passed + failed;
  const applicable = run - counts["not-applicable"];
  return { run, failed, applicable };
}

export function renderSummary(comparison: Comparison, runs: FixtureRun[]): string {
  const counts = count(comparison);
  const { run, applicable } = score(counts);
  const lines = [
    "",
    `${counts.passed} of ${run} tests pass (${percent(counts.passed, run)}). ` +
      `Of the ${applicable} that apply, ${percent(counts.passed, applicable)}.`,
    `  a bug in the plugin: ${counts["plugin-bug"]}, Not Yet: ${counts["not-yet"]}, ` +
      `not applicable: ${counts["not-applicable"]}, not looked at yet: ${counts.untriaged}, ` +
      `skipped by the test itself: ${counts.skipped}`,
  ];
  const slow = runs.reduce((total, run) => total + run.duration, 0);
  lines.push(`  ${runs.length} fixtures, ${(slow / 1000).toFixed(0)}s of fixture time`);
  if (comparison.unexpected.length > 0) {
    lines.push(
      "",
      `${comparison.unexpected.length} results are not what expectations.json says:`,
      "",
    );
    lines.push(...comparison.unexpected.map((line) => `  ${line}`));
    lines.push(
      "",
      "If they are right, run again with --update and give the new failures a reason.",
    );
  } else {
    lines.push("", "Every result is what expectations.json says.");
  }
  return lines.join("\n");
}

const start = "<!-- conformance:results:start -->";
const end = "<!-- conformance:results:end -->";

const escapeCell = (text: string) => text.replaceAll("|", "\\|");

/** The document, with what is between its two markers written anew. */
export function renderDocument(
  document: string,
  comparison: Comparison,
  runs: FixtureRun[],
  nextVersion: string,
): string {
  const [before, rest] = document.split(start);
  const after = rest?.split(end)[1];
  if (before === undefined || after === undefined) {
    throw new Error(
      `docs/next-conformance.md has no ${start} and ${end} to write the results between.`,
    );
  }
  const counts = count(comparison);
  const { run, applicable } = score(counts);
  const lines: string[] = [
    `Measured against \`next@${nextVersion}\`, with \`pnpm conformance --docs\`.`,
    "",
    "| | Tests |",
    "| --- | ---: |",
    `| Run | ${run} |`,
    `| **Pass** | **${counts.passed}** (${percent(counts.passed, run)}) |`,
    `| Fail: a bug in the plugin | ${counts["plugin-bug"]} |`,
    `| Fail: Not Yet | ${counts["not-yet"]} |`,
    `| Fail: not applicable | ${counts["not-applicable"]} |`,
    ...(counts.untriaged > 0 ? [`| Fail: not looked at yet | ${counts.untriaged} |`] : []),
    `| Skipped by the test itself, for a run like this one | ${counts.skipped} |`,
    "",
    `Of the ${applicable} tests that apply, ${counts.passed} pass: **${percent(counts.passed, applicable)}**.`,
    "",
    "### Per Fixture",
    "",
    "| Fixture | Pass | Bug | Not Yet | N/A | Skipped |",
    "| --- | ---: | ---: | ---: | ---: | ---: |",
  ];
  for (const [area, title] of Object.entries(areas)) {
    const inArea = runs.filter((run) => run.fixture.area === area);
    if (inArea.length === 0) continue;
    lines.push(`| **${title}** | | | | | |`);
    for (const { fixture } of inArea) {
      const of = count(comparison, (verdict) => verdict.fixture === fixture);
      const total = score(of).run;
      lines.push(
        `| \`${fixture.dir.replace("test/e2e/app-dir/", "")}\` | ${of.passed} of ${total} | ${of["plugin-bug"] || ""} | ` +
          `${of["not-yet"] || ""} | ${of["not-applicable"] || ""} | ${of.skipped || ""} |`,
      );
    }
  }

  const failures = comparison.verdicts.filter((verdict) => verdict.kind === "expected-failure");
  for (const category of categories) {
    const reasons = Object.entries(comparison.expectations.reasons).filter(
      ([, reason]) => reason.category === category,
    );
    const inCategory = failures.filter((verdict) =>
      reasons.some(([key]) => key === verdict.reason),
    );
    if (inCategory.length === 0) continue;
    lines.push("", `### ${headings[category]}: ${inCategory.length} Tests`, "");
    const byCount = reasons
      .map(([key, reason]) => ({
        reason,
        tests: inCategory.filter((verdict) => verdict.reason === key),
      }))
      .filter(({ tests }) => tests.length > 0)
      .sort((a, b) => b.tests.length - a.tests.length);
    for (const { reason, tests } of byCount) {
      lines.push(`<details><summary>${tests.length} × ${escapeCell(reason.text)}</summary>`, "");
      for (const { fixture, test } of tests) {
        lines.push(`- \`${fixture.id}\`: ${test.id.split(" > ").slice(1).join(" › ")}`);
      }
      lines.push("", "</details>", "");
    }
  }
  return `${before}${start}\n\n${lines.join("\n").trimEnd()}\n\n${end}${after}`;
}
