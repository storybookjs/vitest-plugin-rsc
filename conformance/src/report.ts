import fs from "node:fs";
import { areas, type Fixture } from "./fixtures.ts";

// What a run comes to next to `expectations.json`, the file that says which
// tests fail and why. A result that is not what the file says is what a run
// is for: it fails the run.

export type TestRun = {
  /** The test file and the names of the `describe` blocks and of the test, joined by " > ". */
  id: string;
  state: "passed" | "failed" | "skipped";
  message?: string;
  /** What the runner could not give the test, when that is why it failed. */
  unsupported?: string;
  duration?: number;
};

type State = TestRun["state"] | "not run";

export type FixtureRun = {
  fixture: Fixture;
  duration: number;
  /**
   * Why the run is not all of the fixture: it did not start, it was stopped,
   * or a test file of it did not load. Its tests are the ones that did end.
   */
  failure?: string;
  tests: TestRun[];
  /** The tests that ended otherwise in the run before this one, of the same fixture. */
  unstable?: { id: string; before: State; now: State }[];
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
   * A regular expression for the message of the failure. A test with this
   * reason has to fail with a message that matches, and `--update` gives a
   * new failure the first reason that matches it.
   */
  match?: string;
};

export type Expectations = {
  reasons: Record<string, Reason>;
  fixtures: Record<
    string,
    {
      /** How many of its tests pass. */
      passed: number;
      /** The tests that fail, each with the key of its reason. */
      failed: Record<string, string>;
    }
  >;
};

const untriaged = "untriaged";

export function readExpectations(file: string): Expectations {
  const expectations = JSON.parse(fs.readFileSync(file, "utf8")) as Expectations;
  for (const [key, reason] of Object.entries(expectations.reasons)) {
    if (!categories.includes(reason.category)) {
      throw new Error(
        `expectations.json: the reason "${key}" has the category "${reason.category}". ` +
          `It is one of ${categories.join(", ")}.`,
      );
    }
    // Throws for one that is no regular expression.
    if (reason.match !== undefined) new RegExp(reason.match);
  }
  for (const [fixture, { failed }] of Object.entries(expectations.fixtures)) {
    for (const [test, reason] of Object.entries(failed)) {
      if (!Object.hasOwn(expectations.reasons, reason)) {
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

const messageOf = (test: TestRun) => test.unsupported ?? test.message ?? "";
const matches = (reason: Reason, test: TestRun) =>
  reason.match === undefined || new RegExp(reason.match, "i").test(messageOf(test));
const passedOf = (run: FixtureRun) => run.tests.filter((test) => test.state === "passed").length;

function reasonFor(expectations: Expectations, test: TestRun): string {
  for (const [key, reason] of Object.entries(expectations.reasons)) {
    if (reason.match !== undefined && matches(reason, test)) return key;
  }
  return untriaged;
}

/**
 * The expectations as the runs say they are. A test that still fails keeps
 * its reason, unless it now fails with a message that its reason does not
 * have. A fixture whose run is not all of it stays as it was.
 */
export function updateExpectations(expectations: Expectations, runs: FixtureRun[]): Expectations {
  const fixtures = { ...expectations.fixtures };
  for (const run of runs) {
    if (run.failure) continue;
    const before = fixtures[run.fixture.id]?.failed ?? {};
    const failed = run.tests
      .filter((test) => test.state === "failed")
      .map((test) => {
        const known = before[test.id];
        const reason = known === undefined ? undefined : expectations.reasons[known];
        const stays = known !== untriaged && reason !== undefined && matches(reason, test);
        return [test.id, stays ? known! : reasonFor(expectations, test)] as const;
      });
    fixtures[run.fixture.id] = { passed: passedOf(run), failed: Object.fromEntries(failed) };
  }
  // The reason of a failure that nobody has looked at is there while one has it.
  const { [untriaged]: _, ...reasons } = expectations.reasons;
  const isUsed = Object.values(fixtures).some(({ failed }) =>
    Object.values(failed).includes(untriaged),
  );
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
  unexpected: { fixture: Fixture; text: string }[];
};

/**
 * The runs next to the expectations. With `partial`, the runs are of the
 * tests that `--grep` picked: what did not run says nothing then.
 */
export function compare(
  expectations: Expectations,
  runs: FixtureRun[],
  { partial = false }: { partial?: boolean } = {},
): Comparison {
  const verdicts: Verdict[] = [];
  const unexpected: Comparison["unexpected"] = [];
  for (const run of runs) {
    const { fixture, tests } = run;
    const differences = unexpected.length;
    const differs = (text: string) => unexpected.push({ fixture, text });
    const expected = expectations.fixtures[fixture.id];
    const failing = expected?.failed ?? {};
    if (run.failure) {
      differs(`DID NOT RUN TO ITS END: ${fixture.id}\n    ${run.failure.split("\n")[0]}`);
    }
    // Whether what did not run, or did not pass, says something.
    const isWhole = !partial && !run.failure;

    const seen = new Set<string>();
    for (const test of tests) {
      seen.add(test.id);
      const key = failing[test.id];
      const reason = key === undefined ? undefined : expectations.reasons[key];
      const first = (test.message ?? "").split("\n")[0];
      if (test.state === "failed" && reason && matches(reason, test)) {
        verdicts.push({ fixture, test, kind: "expected-failure", reason: key });
      } else if (test.state === "failed") {
        verdicts.push({ fixture, test, kind: "unexpected-failure" });
        differs(
          reason
            ? `FAILED, and not the way expectations.json says (${key}): ${fixture.id} > ${test.id}\n    ${first}`
            : `FAILED, and expectations.json does not say so: ${fixture.id} > ${test.id}\n    ${first}`,
        );
      } else if (test.state === "passed") {
        verdicts.push({ fixture, test, kind: key ? "unexpected-pass" : "passed" });
        if (key) {
          differs(
            `PASSED, and expectations.json says it fails (${key}): ${fixture.id} > ${test.id}`,
          );
        }
      } else {
        verdicts.push({ fixture, test, kind: "skipped" });
        if (key && isWhole) {
          differs(
            `SKIPPED, and expectations.json says it fails (${key}): ${fixture.id} > ${test.id}`,
          );
        }
      }
    }
    if (!isWhole) continue;
    if (!expected) {
      differs(`NOT IN expectations.json: ${fixture.id}`);
      continue;
    }
    for (const id of Object.keys(failing)) {
      if (!seen.has(id)) {
        differs(`NOT RUN, and expectations.json says it fails: ${fixture.id} > ${id}`);
      }
    }
    // The tests that pass are not in the file one by one. Their number is: a
    // test that is skipped or gone since must not go unseen. It says nothing
    // new when a test of the fixture is already named.
    const passed = passedOf(run);
    if (passed !== expected.passed && unexpected.length === differences) {
      differs(`${passed} TESTS PASS, and expectations.json says ${expected.passed}: ${fixture.id}`);
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
      counts[comparison.expectations.reasons[verdict.reason ?? untriaged]?.category ?? untriaged]++;
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
  const time = runs.reduce((total, run) => total + run.duration, 0);
  const lines = [
    "",
    `${counts.passed} of ${run} tests pass (${percent(counts.passed, run)}). ` +
      `Of the ${applicable} that apply, ${percent(counts.passed, applicable)}.`,
    `  a bug in the plugin: ${counts["plugin-bug"]}, Not Yet: ${counts["not-yet"]}, ` +
      `not applicable: ${counts["not-applicable"]}, not looked at yet: ${counts.untriaged}, ` +
      `skipped by the test itself: ${counts.skipped}`,
    `  ${runs.length} fixtures, ${(time / 1000).toFixed(0)}s of fixture time`,
  ];

  // A fixture runs again when its run was not what the expectations say. A
  // test that ends otherwise the second time has no result to rely on.
  const unstable = runs.flatMap((run) =>
    (run.unstable ?? []).map(
      ({ id, before, now }) => `  ${before} at first, then ${now}: ${run.fixture.id} > ${id}`,
    ),
  );
  if (unstable.length > 0) {
    lines.push(
      "",
      `${unstable.length} tests ended otherwise when their fixture ran again. The second run counts:`,
      "",
      ...unstable,
    );
  }
  if (comparison.unexpected.length > 0) {
    lines.push(
      "",
      `${comparison.unexpected.length} results are not what expectations.json says:`,
      "",
      ...comparison.unexpected.map(({ text }) => `  ${text}`),
    );
  } else {
    lines.push("", "Every result is what expectations.json says.");
  }
  return lines.join("\n");
}

const start = "<!-- conformance:results:start -->";
const end = "<!-- conformance:results:end -->";

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
      lines.push(`<details><summary>${tests.length} × ${reason.text}</summary>`, "");
      for (const { fixture, test } of tests) {
        lines.push(`- \`${fixture.id}\`: ${test.id.split(" > ").slice(1).join(" › ")}`);
      }
      lines.push("", "</details>", "");
    }
  }
  return `${before}${start}\n\n${lines.join("\n").trimEnd()}\n\n${end}${after}`;
}
