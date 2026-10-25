import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test } from "vitest";
import { codeKey } from "./own-code.ts";

test("keys the plugin's code by the contents of its files, not their times or tests", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vitest-plugin-rsc-code-"));
  try {
    fs.mkdirSync(path.join(dir, "nextjs"));
    fs.writeFileSync(path.join(dir, "nextjs/server-code.ts"), "export const a = 1;\n");
    fs.writeFileSync(path.join(dir, "async-local-storage-transform.ts"), "export {};\n");
    const key = codeKey(dir);
    expect(codeKey(dir)).toBe(key);

    // A build that writes the same file again.
    const later = new Date(Date.now() + 60_000);
    fs.utimesSync(path.join(dir, "nextjs/server-code.ts"), later, later);
    expect(codeKey(dir)).toBe(key);
    // Tests and types are no part of the code.
    fs.writeFileSync(path.join(dir, "nextjs/server-code.test.ts"), "test();\n");
    fs.writeFileSync(path.join(dir, "index.d.ts"), "export {};\n");
    expect(codeKey(dir)).toBe(key);

    // A change of the compile, in the source or in a chunk of the build.
    fs.writeFileSync(path.join(dir, "nextjs/server-code.ts"), "export const a = 2;\n");
    const changed = codeKey(dir);
    expect(changed).not.toBe(key);
    fs.writeFileSync(path.join(dir, "chunk-1a2b3c.js"), "export {};\n");
    expect(codeKey(dir)).not.toBe(changed);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
