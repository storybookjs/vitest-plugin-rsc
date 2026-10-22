import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { rolldown } from "rolldown";
import { afterEach, beforeEach, expect, test } from "vitest";
import { productionPlugin } from "./build.ts";

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
async function bundle(input: string, renderers: string[] = []): Promise<string> {
  const build = await rolldown({
    input,
    plugins: [productionPlugin(nextDir, renderers)],
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

test("makes NODE_ENV production in the files of a renderer", async () => {
  const entry = write(
    "app/page.js",
    `import { mode, nested } from "@kit/react/index.js";
import { other } from "@kit/react-docs/index.js";
export const app = process.env.NODE_ENV;
export { mode, nested, other };
`,
  );
  write(
    "node_modules/@kit/react/index.js",
    `export { nested } from "./node_modules/is-what/index.js";
export const mode = process.env.NODE_ENV;
`,
  );
  // A package nested under the renderer, as npm installs one.
  write(
    "node_modules/@kit/react/node_modules/is-what/index.js",
    "export const nested = process.env.NODE_ENV;\n",
  );
  // Another package whose name starts the same.
  write("node_modules/@kit/react-docs/index.js", "export const other = process.env.NODE_ENV;\n");

  const code = await bundle(entry, ["@kit/react"]);

  expect(code).toContain('const app = "test";');
  expect(code).toContain('const nested = "test";');
  expect(code).toContain('const mode = "production";');
  expect(code).toContain('const other = "test";');
});
