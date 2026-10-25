// Writes tests/dom-locators/ from tests/vitest/, and test/dom-locators.ts
// from test/vitest.ts: the same tests, with `page` of dom-locators instead
// of `vitest/browser`'s, so the column measures what that import buys.
//
//   node test/write-dom-locators-tests.ts

import fs from "node:fs";
import path from "node:path";

const root = path.join(import.meta.dirname, "..");
const swap = (source: string) =>
  source
    .replaceAll('from "vitest/browser";', 'from "dom-locators";')
    .replaceAll('from "#test/vitest.ts";', 'from "#test/dom-locators.ts";');

const from = path.join(root, "tests/vitest");
const to = path.join(root, "tests/dom-locators");
fs.rmSync(to, { recursive: true, force: true });
fs.mkdirSync(to);
for (const file of fs.readdirSync(from)) {
  fs.writeFileSync(path.join(to, file), swap(fs.readFileSync(path.join(from, file), "utf8")));
}
const helpers = fs.readFileSync(path.join(root, "test/vitest.ts"), "utf8");
fs.writeFileSync(
  path.join(root, "test/dom-locators.ts"),
  swap(helpers).replace(
    "// The helpers of tests/vitest/, which tests/playwright/test.ts has too.",
    "// The helpers of tests/dom-locators/: test/vitest.ts, by test/write-dom-locators-tests.ts.",
  ),
);
