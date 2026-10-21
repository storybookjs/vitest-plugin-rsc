import fs from "node:fs";
import path from "node:path";
import type { Frame } from "playwright";

// A value in each env file of a copy of the project, and one in the shell of
// its Storybook: which of them the page has says which files were read
// (docs/next-routes.md, "Environment Variables"). `.env.local` has a name of
// `.env.test` too, as a machine has its real database next to the test one,
// and so does the shell, which Next would prefer to the files.
// And a module that the preview imports first, which reads `process.env` as
// it evaluates.

export const sentinels = {
  test: "sentinel-of-the-tests",
  testLocal: "sentinel-of-the-machine",
  local: "sentinel-of-a-secret",
  development: "sentinel-of-development",
  production: "sentinel-of-production",
  shell: "sentinel-of-the-shell",
};

/** The env of the shell that runs the Storybook: a name that no file has, and one that `.env.test` has. */
export const shellEnv = { SECRET_TOKEN: sentinels.shell, SENTINEL: sentinels.shell };

export function writeEnvFiles(copy: string): void {
  const write = (file: string, lines: string[]) =>
    fs.appendFileSync(path.join(copy, file), `\n${lines.join("\n")}\n`);
  write(".env.test", [`SENTINEL=${sentinels.test}`, `NEXT_PUBLIC_SENTINEL=${sentinels.test}`]);
  write(".env.test.local", [`SENTINEL_OF_THE_MACHINE=${sentinels.testLocal}`]);
  write(".env.local", [
    `SENTINEL=${sentinels.local}`,
    `NEXT_PUBLIC_SENTINEL=${sentinels.local}`,
    `SENTINEL_OF_A_SECRET=${sentinels.local}`,
  ]);
  write(".env.development", [`SENTINEL_OF_DEVELOPMENT=${sentinels.development}`]);
  write(".env.production", [`SENTINEL_OF_PRODUCTION=${sentinels.production}`]);

  fs.writeFileSync(
    path.join(copy, ".storybook/first-import.ts"),
    "Object.assign(globalThis, { firstImportRead: process.env.NEXT_PUBLIC_SENTINEL });\n",
  );
  const preview = path.join(copy, ".storybook/preview.tsx");
  const source = fs.readFileSync(preview, "utf8");
  fs.writeFileSync(
    preview,
    source.replace('"use client";\n', '"use client";\nimport "./first-import.ts";\n'),
  );
}

/** What the canvas has of the sentinels: in its `process.env`, and what the preview's first import read. */
export function envOf(canvas: Frame) {
  return canvas.evaluate(() => {
    const { env } = (globalThis as unknown as { process: { env: Record<string, string> } }).process;
    return {
      SENTINEL: env.SENTINEL,
      NEXT_PUBLIC_SENTINEL: env.NEXT_PUBLIC_SENTINEL,
      SENTINEL_OF_THE_MACHINE: env.SENTINEL_OF_THE_MACHINE,
      SENTINEL_OF_A_SECRET: env.SENTINEL_OF_A_SECRET,
      SENTINEL_OF_DEVELOPMENT: env.SENTINEL_OF_DEVELOPMENT,
      SENTINEL_OF_PRODUCTION: env.SENTINEL_OF_PRODUCTION,
      SECRET_TOKEN: env.SECRET_TOKEN,
      firstImportRead: (globalThis as { firstImportRead?: string }).firstImportRead,
    };
  });
}
