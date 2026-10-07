import assert from "node:assert/strict";
import { test } from "node:test";
import type { Fixture } from "./fixtures.ts";
import {
  compare,
  renderDocument,
  updateExpectations,
  type Expectations,
  type FixtureRun,
  type TestRun,
} from "./report.ts";

const fixture: Fixture = {
  id: "app",
  dir: "test/e2e/app-dir/app",
  tests: ["app.test.ts"],
  area: "basics",
};
const run = (...tests: TestRun[]): FixtureRun => ({ fixture, duration: 1000, tests });
const passed = (id: string): TestRun => ({ id, state: "passed" });
const failed = (id: string, message = "expected 1 to be 2"): TestRun => ({
  id,
  state: "failed",
  message,
});

const expectations: Expectations = {
  reasons: {
    middleware: { category: "not-yet", text: "`middleware.ts` does not run." },
    "javascript-off": {
      category: "not-applicable",
      text: "JavaScript off.",
      match: "a page with JavaScript off",
    },
    bug: { category: "plugin-bug", text: "A bug." },
  },
  fixtures: { app: { "a > fails": "middleware" } },
};

await test("takes a failure that the expectations name, and a pass that they do not", () => {
  const { verdicts, unexpected } = compare(expectations, [
    run(failed("a > fails"), passed("a > passes")),
  ]);

  assert.deepEqual(unexpected, []);
  assert.deepEqual(
    verdicts.map(({ kind, reason }) => [kind, reason]),
    [
      ["expected-failure", "middleware"],
      ["passed", undefined],
    ],
  );
});

await test("tells of a failure that the expectations do not name", () => {
  const { unexpected } = compare(expectations, [
    run(failed("a > fails"), failed("a > new", "boom\nat x")),
  ]);

  assert.equal(unexpected.length, 1);
  assert.match(
    unexpected[0]!,
    /^FAILED, and expectations\.json does not say so: app > a > new\n\s+boom$/,
  );
});

await test("tells of a test that passes, is skipped or is gone while the expectations say it fails", () => {
  assert.match(
    compare(expectations, [run(passed("a > fails"))]).unexpected[0]!,
    /^PASSED, .*\(middleware\): app > a > fails$/,
  );
  assert.match(
    compare(expectations, [run({ id: "a > fails", state: "skipped" })]).unexpected[0]!,
    /^SKIPPED, .*\(middleware\): app > a > fails$/,
  );
  assert.match(
    compare(expectations, [run(passed("a > other"))]).unexpected[0]!,
    /^NOT RUN, .*: app > a > fails$/,
  );
});

await test("says nothing of a fixture that did not run", () => {
  assert.deepEqual(compare(expectations, []).unexpected, []);
});

await test("updates the expectations: a failure keeps its reason, a pass loses it, a new one is matched", () => {
  const updated = updateExpectations(expectations, [
    run(
      failed("a > fails"),
      {
        id: "a > no js",
        state: "failed",
        message: "x",
        unsupported: "a page with JavaScript off: the test runs in a tab",
      },
      failed("a > new"),
      passed("a > passes"),
    ),
  ]);

  assert.deepEqual(updated.fixtures.app, {
    "a > fails": "middleware",
    "a > no js": "javascript-off",
    "a > new": "untriaged",
  });
  assert.equal(updated.reasons.untriaged?.category, "untriaged");

  const fixed = updateExpectations(expectations, [run(passed("a > fails"))]);
  assert.equal(fixed.fixtures.app, undefined);
  assert.equal(fixed.reasons.untriaged, undefined);
});

await test("looks at a failure again that had no reason yet", () => {
  const before: Expectations = { ...expectations, fixtures: { app: { "a > no js": "untriaged" } } };
  const updated = updateExpectations(before, [
    run({ id: "a > no js", state: "failed", unsupported: "a page with JavaScript off" }),
  ]);

  assert.deepEqual(updated.fixtures.app, { "a > no js": "javascript-off" });
});

await test("writes the results between the markers of the document, and nothing else", () => {
  const document =
    "# Title\n\n<!-- conformance:results:start -->\nold\n<!-- conformance:results:end -->\n\nAfter.\n";
  const bugs: Expectations = {
    ...expectations,
    fixtures: { app: { "a > fails": "middleware", "b > breaks": "bug" } },
  };
  const runs = [
    run(
      failed("app.test.ts > a > fails"),
      failed("app.test.ts > b > breaks"),
      passed("app.test.ts > c"),
      passed("app.test.ts > d"),
    ),
  ];
  bugs.fixtures.app = {
    "app.test.ts > a > fails": "middleware",
    "app.test.ts > b > breaks": "bug",
  };

  const written = renderDocument(document, compare(bugs, runs), runs, "16.4.0");

  assert.match(written, /^# Title\n\n<!-- conformance:results:start -->\n/);
  assert.match(written, /<!-- conformance:results:end -->\n\nAfter\.\n$/);
  assert.doesNotMatch(written, /\nold\n/);
  assert.match(written, /\| \*\*Pass\*\* \| \*\*2\*\* \(50%\) \|/);
  assert.match(written, /\| Fail: a bug in the plugin \| 1 \|/);
  assert.match(written, /\| Fail: Not Yet \| 1 \|/);
  assert.match(written, /- `app`: b › breaks/);
  // Written again, it is the same: the block replaces itself.
  assert.equal(renderDocument(written, compare(bugs, runs), runs, "16.4.0"), written);
});

await test("refuses a document without the markers", () => {
  assert.throws(
    () => renderDocument("# Title\n", compare(expectations, []), [], "16.4.0"),
    /has no <!-- conformance:results:start -->/,
  );
});
