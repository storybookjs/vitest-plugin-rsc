import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { rolldown } from "rolldown";
import { afterEach, beforeEach, expect, test } from "vitest";
import { nextProductionPlugin } from "./build.ts";

let dir: string;
let nextDir: string;

beforeEach(() => {
  // By its real path, as Node.js resolves the `next` of a project.
  dir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "next-build-"));
  nextDir = path.join(dir, "node_modules/next");
});

afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

function write(file: string, code: string): string {
  const absolute = path.join(dir, file);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, code);
  return absolute;
}

// Bundled as the dependency optimizer does, with the NODE_ENV of Vitest.
async function bundle(input: string): Promise<string> {
  const build = await rolldown({
    input,
    plugins: [nextProductionPlugin(nextDir)],
    transform: { define: { "process.env.NODE_ENV": '"test"' } },
    logLevel: "silent",
  });
  const { output } = await build.generate({ format: "esm" });
  return output[0].code;
}

test("makes NODE_ENV production in the files of Next", async () => {
  const entry = write(
    "node_modules/next/dist/compiled/react/index.js",
    `if (process.env.NODE_ENV === "production") {
  module.exports = "production";
} else {
  module.exports = "development";
}
`,
  );

  const code = await bundle(entry);

  expect(code).toContain('"production"');
  expect(code).not.toContain('"development"');
});

test("leaves NODE_ENV in a string, and an assignment to it", async () => {
  const entry = write(
    "node_modules/next/dist/server/lib/env.js",
    `process.env.NODE_ENV = "test";
export const message = "Set process.env.NODE_ENV";
export const mode = process.env.NODE_ENV;
`,
  );

  const code = await bundle(entry);

  expect(code).toContain('process.env.NODE_ENV = "test";');
  expect(code).toContain('const message = "Set process.env.NODE_ENV";');
  expect(code).toContain('const mode = "production";');
});

test("leaves the files of the app and of its other packages as they are", async () => {
  const entry = write(
    "app/page.js",
    `import { mode } from "other/index.js";
export const app = process.env.NODE_ENV;
export const other = mode;
`,
  );
  write("node_modules/other/index.js", "export const mode = process.env.NODE_ENV;\n");

  const code = await bundle(entry);

  expect(code).toContain('const app = "test";');
  expect(code).toContain('const mode = "test";');
});
