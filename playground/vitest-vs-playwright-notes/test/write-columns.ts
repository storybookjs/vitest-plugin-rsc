// Writes the columns that are made from tests/vitest/: tests/dom-locators/
// (see test/dom-locators-column.ts), with test/dom-locators.ts from
// test/vitest.ts, and tests/vitest-user-event/ (see test/user-event-column.ts).
//
//   pnpm write-columns

import fs from "node:fs";
import path from "node:path";
import { toDomLocators, toDomLocatorsHelpers } from "./dom-locators-column.ts";
import { toUserEvent } from "./user-event-column.ts";

const root = path.join(import.meta.dirname, "..");
const from = path.join(root, "tests/vitest");

function writeColumn(directory: string, toColumn: (source: string) => string): void {
  const to = path.join(root, directory);
  fs.rmSync(to, { recursive: true, force: true });
  fs.mkdirSync(to);
  for (const file of fs.readdirSync(from)) {
    fs.writeFileSync(path.join(to, file), toColumn(fs.readFileSync(path.join(from, file), "utf8")));
  }
}

writeColumn("tests/dom-locators", toDomLocators);
fs.writeFileSync(
  path.join(root, "test/dom-locators.ts"),
  toDomLocatorsHelpers(fs.readFileSync(path.join(root, "test/vitest.ts"), "utf8")),
);
writeColumn("tests/vitest-user-event", toUserEvent);
