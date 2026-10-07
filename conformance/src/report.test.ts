import assert from "node:assert/strict";
import { test } from "node:test";
import type { Fixture } from "./fixtures.ts";
import {
  compare,
  renderDocument,
  renderSummary,
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
const skipped = (id: string): TestRun => ({ id, state: "skipped" });
const failed = (id: string, message = "expected 1 to be 2"): TestRun => ({
  id,
  state: "failed",
  message,
});
const noJavaScript = (id: string): TestRun => ({
  id,
  state: "failed",
  message: "[next-conformance:unsupported] a page with JavaScript off",
  unsupported: "a page with JavaScript off: the test runs in a tab",
});

const reasons: Expectations["reasons"] = {
  middleware: { category: "not-yet", text: "`middleware.ts` does not run." },
  "javascript-off": {
    category: "not-applicable",
    text: "JavaScript off.",
    match: "a page with JavaScript off",
  },
  bug: { category: "plugin-bug", text: "A bug." },
};
// One test of the fixture passes, and one fails for the middleware.
const expectations: Expectations = {
  reasons,
  fixtures: { app: { passed: 1, failed: { "a > fails": "middleware" } } },
};
const texts = (comparison: { unexpected: { text: string }[] }) =>
  comparison.unexpected.map(({ text }) => text);

await test("takes a failure that the expectations name, and a pass that they do not", () => {
  const comparison = compare(expectations, [run(failed("a > fails"), passed("a > passes"))]);

  assert.deepEqual(texts(comparison), []);
  assert.deepEqual(
    comparison.verdicts.map(({ kind, reason }) => [kind, reason]),
    [
      ["expected-failure", "middleware"],
      ["passed", undefined],
    ],
  );
});

await test("tells of a failure that the expectations do not name", () => {
  const comparison = compare(expectations, [
    run(failed("a > fails"), passed("a > passes"), failed("a > new", "boom\nat x")),
  ]);

  assert.deepEqual(texts(comparison), [
    "FAILED, and expectations.json does not say so: app > a > new\n    boom",
  ]);
});

await test("tells of a test that passes, is skipped or is gone while the expectations say it fails", () => {
  const says = (...tests: TestRun[]) => texts(compare(expectations, [run(...tests)]))[0];

  assert.equal(
    says(passed("a > fails"), passed("a > passes")),
    "PASSED, and expectations.json says it fails (middleware): app > a > fails",
  );
  assert.equal(
    says(skipped("a > fails"), passed("a > passes")),
    "SKIPPED, and expectations.json says it fails (middleware): app > a > fails",
  );
  assert.equal(
    says(passed("a > passes")),
    "NOT RUN, and expectations.json says it fails: app > a > fails",
  );
});

await test("tells of a test that passed and is skipped or gone", () => {
  assert.deepEqual(
    texts(compare(expectations, [run(failed("a > fails"), skipped("a > passes"))])),
    ["0 TESTS PASS, and expectations.json says 1: app"],
  );
  assert.deepEqual(texts(compare(expectations, [run(failed("a > fails"))])), [
    "0 TESTS PASS, and expectations.json says 1: app",
  ]);
});

await test("tells of a failure with another message than its reason has", () => {
  const withMatch: Expectations = {
    reasons,
    fixtures: { app: { passed: 0, failed: { "a > no js": "javascript-off" } } },
  };

  assert.deepEqual(texts(compare(withMatch, [run(noJavaScript("a > no js"))])), []);
  assert.deepEqual(texts(compare(withMatch, [run(failed("a > no js", "boom"))])), [
    "FAILED, and not the way expectations.json says (javascript-off): app > a > no js\n    boom",
  ]);
});

await test("tells of a fixture that did not run to its end, and of nothing it did not get to", () => {
  const stopped: FixtureRun = { ...run(passed("a > passes")), failure: "stopped\nmore" };

  assert.deepEqual(texts(compare(expectations, [stopped])), [
    "DID NOT RUN TO ITS END: app\n    stopped",
  ]);
});

await test("tells of a fixture that the expectations do not have", () => {
  assert.deepEqual(texts(compare({ reasons, fixtures: {} }, [run(passed("a > passes"))])), [
    "NOT IN expectations.json: app",
  ]);
});

await test("says nothing of what a run of a few tests did not run", () => {
  const few = [run(skipped("a > fails"), passed("a > passes"), skipped("a > other"))];

  assert.deepEqual(texts(compare(expectations, few, { partial: true })), []);
  assert.deepEqual(
    texts(compare(expectations, [run(failed("a > new", "boom"))], { partial: true })),
    ["FAILED, and expectations.json does not say so: app > a > new\n    boom"],
  );
});

await test("says nothing of a fixture that did not run", () => {
  assert.deepEqual(texts(compare(expectations, [])), []);
});

await test("updates the expectations: a failure keeps its reason, a pass loses it, a new one is matched", () => {
  const updated = updateExpectations(expectations, [
    run(failed("a > fails"), noJavaScript("a > no js"), failed("a > new"), passed("a > passes")),
  ]);

  assert.deepEqual(updated.fixtures.app, {
    passed: 1,
    failed: { "a > fails": "middleware", "a > no js": "javascript-off", "a > new": "untriaged" },
  });
  assert.equal(updated.reasons.untriaged?.category, "untriaged");

  const fixed = updateExpectations(expectations, [run(passed("a > fails"), passed("a > passes"))]);
  assert.deepEqual(fixed.fixtures.app, { passed: 2, failed: {} });
  assert.equal(fixed.reasons.untriaged, undefined);
  // What `--update` writes is what the run is.
  assert.deepEqual(texts(compare(fixed, [run(passed("a > fails"), passed("a > passes"))])), []);
});

await test("looks again at a failure that had no reason yet, or has another message now", () => {
  const before: Expectations = {
    reasons,
    fixtures: {
      app: { passed: 0, failed: { "a > no js": "untriaged", "b > no js": "javascript-off" } },
    },
  };
  const updated = updateExpectations(before, [
    run(noJavaScript("a > no js"), failed("b > no js", "boom")),
  ]);

  assert.deepEqual(updated.fixtures.app?.failed, {
    "a > no js": "javascript-off",
    "b > no js": "untriaged",
  });
});

await test("leaves the expectations of a fixture whose run is not all of it", () => {
  const stopped: FixtureRun = { ...run(failed("a > new")), failure: "stopped" };

  assert.deepEqual(updateExpectations(expectations, [stopped]), expectations);
});

await test("names the tests that ended otherwise when their fixture ran again", () => {
  const twice: FixtureRun = {
    ...run(failed("a > fails"), passed("a > passes")),
    unstable: [{ id: "a > passes", before: "failed", now: "passed" }],
  };
  const summary = renderSummary(compare(expectations, [twice]), [twice]);

  assert.match(summary, /1 of 2 tests pass \(50%\)/);
  assert.match(summary, /1 tests ended otherwise when their fixture ran again/);
  assert.match(summary, /failed at first, then passed: app > a > passes/);
  assert.match(summary, /Every result is what expectations\.json says\./);
});

await test("writes the results between the markers of the document, and nothing else", () => {
  const document =
    "# Title\n\n<!-- conformance:results:start -->\nold\n<!-- conformance:results:end -->\n\nAfter.\n";
  const two: Expectations = {
    reasons,
    fixtures: {
      app: {
        passed: 2,
        failed: { "app.test.ts > a > fails": "middleware", "app.test.ts > b > breaks": "bug" },
      },
    },
  };
  const runs = [
    run(
      failed("app.test.ts > a > fails"),
      failed("app.test.ts > b > breaks"),
      passed("app.test.ts > c"),
      passed("app.test.ts > d"),
    ),
  ];

  const written = renderDocument(document, compare(two, runs), runs, "16.4.0");

  assert.match(written, /^# Title\n\n<!-- conformance:results:start -->\n/);
  assert.match(written, /<!-- conformance:results:end -->\n\nAfter\.\n$/);
  assert.doesNotMatch(written, /\nold\n/);
  assert.match(written, /\| \*\*Pass\*\* \| \*\*2\*\* \(50%\) \|/);
  assert.match(written, /\| Fail: a bug in the plugin \| 1 \|/);
  assert.match(written, /\| Fail: Not Yet \| 1 \|/);
  assert.match(written, /- `app`: b › breaks/);
  // Written again, it is the same: the block replaces itself.
  assert.equal(renderDocument(written, compare(two, runs), runs, "16.4.0"), written);
});

await test("refuses a document without the markers", () => {
  assert.throws(
    () => renderDocument("# Title\n", compare(expectations, []), [], "16.4.0"),
    /has no <!-- conformance:results:start -->/,
  );
});
