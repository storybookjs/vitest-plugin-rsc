// Writes tests/dom-locators/ from tests/vitest/, and test/dom-locators.ts
// from test/vitest.ts: see test/dom-locators-column.ts.
//
//   node test/write-dom-locators-tests.ts

import fs from "node:fs";
import path from "node:path";
import { toDomLocators, toDomLocatorsHelpers } from "./dom-locators-column.ts";

const root = path.join(import.meta.dirname, "..");
const from = path.join(root, "tests/vitest");
const to = path.join(root, "tests/dom-locators");
fs.rmSync(to, { recursive: true, force: true });
fs.mkdirSync(to);
for (const file of fs.readdirSync(from)) {
  fs.writeFileSync(
    path.join(to, file),
    toDomLocators(fs.readFileSync(path.join(from, file), "utf8")),
  );
}
fs.writeFileSync(
  path.join(root, "test/dom-locators.ts"),
  toDomLocatorsHelpers(fs.readFileSync(path.join(root, "test/vitest.ts"), "utf8")),
);
