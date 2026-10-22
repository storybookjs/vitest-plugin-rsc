import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, onTestFinished, test } from "vitest";
import { exportNamesOf } from "./module-exports.ts";

// Modules of Next, by their file in a directory of their own.
function modules(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "next-"));
  onTestFinished(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const [file, code] of Object.entries(files)) fs.writeFileSync(path.join(dir, file), code);
  return dir;
}

test("reads what a module of Next exports, and of its `export *` all but the default", () => {
  const dir = modules({
    "a.js": [
      "export function a() {}",
      "export const { b, c: [d] } = {};",
      "const e = 1;",
      "export { e as f };",
      "export * from './g';",
      "export default a;",
    ].join("\n"),
    "g.js": "export const g = 1;\nexport default g;\nexport * from './a';",
  });

  expect([...exportNamesOf(path.join(dir, "a.js"))].sort()).toEqual([
    "a",
    "b",
    "d",
    "default",
    "f",
    "g",
  ]);
});
