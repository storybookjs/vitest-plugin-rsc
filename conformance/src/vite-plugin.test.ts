import assert from "node:assert/strict";
import { test } from "node:test";
import { importedNames, rewriteGates } from "./vite-plugin.ts";

await test("rewrites a gate pragma into a call on the line of the test, as Next's transform does", () => {
  const code = ["  // @gate !cacheComponents", "  it('does a thing', async () => {})", ""].join(
    "\n",
  );

  assert.equal(
    rewriteGates(code),
    [
      "  // @gate !cacheComponents",
      `  _test_gate([{"force":false,"source":"!cacheComponents"}],"it")('does a thing', async () => {})`,
      "",
    ].join("\n"),
  );
});

await test("takes the pragmas above a call together, and tells a forced one", () => {
  const code = [
    "// @force-gate !deploy",
    "// @gate start",
    "describe.only('suite', () => {})",
  ].join("\n");

  assert.match(
    rewriteGates(code),
    /_test_gate\(\[\{"force":true,"source":"!deploy"\},\{"force":false,"source":"start"\}\],"describe\.only"\)\('suite'/,
  );
});

await test("rewrites a gate on describe.each", () => {
  const code = ["// @force-gate dev", "describe.each(['a', 'b'])('suite %s', () => {})"].join("\n");

  assert.match(
    rewriteGates(code),
    /^_test_gate_describe_each\(\[\{"force":true,"source":"dev"\}\],\['a', 'b'\]\)/m,
  );
});

await test("leaves a file without pragmas, and a pragma that is not above a test", () => {
  const plain = "it('does a thing', () => {})\n";
  assert.equal(rewriteGates(plain), plain);

  const prose = "// @gate dev\n\nit('does a thing', () => {})\n";
  assert.equal(rewriteGates(prose), prose);
});

await test("finds the names a test file imports from a module", () => {
  const code = [
    "import fs, { readFile, writeFile as write } from 'fs-extra'",
    "import type { Page } from 'playwright'",
    "import { type Request, chromium } from 'playwright'",
    "import * as http from 'http'",
  ].join("\n");

  assert.deepEqual(importedNames(code, "fs-extra"), {
    names: ["readFile", "writeFile"],
    hasDefault: true,
  });
  assert.deepEqual(importedNames(code, "playwright"), { names: ["chromium"], hasDefault: false });
  assert.deepEqual(importedNames(code, "http"), { names: [], hasDefault: true });
  assert.deepEqual(importedNames(code, "fs"), { names: [], hasDefault: false });
});
