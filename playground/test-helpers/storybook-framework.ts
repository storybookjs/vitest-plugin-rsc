import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// A global setup of the projects that run Storybook: Storybook loads the
// preset of a framework by its build, also when the suite runs the source of
// the packages. So it builds @storybook/nextjs-vite-rsc once, before any
// test, as a build during a test would reload the preview of another one.

const framework = fileURLToPath(
  new URL("../../packages/storybook-nextjs-vite-rsc/", import.meta.url),
);

const newest = (dir: string): number =>
  Math.max(
    0,
    ...fs
      .readdirSync(dir, { recursive: true, encoding: "utf8" })
      .map((file) => fs.statSync(path.join(dir, file)).mtimeMs),
  );

export function setup(): void {
  if (
    !process.env.NODE_OPTIONS?.includes("storybook-nextjs-vite-rsc-source") &&
    !process.execArgv.join(" ").includes("storybook-nextjs-vite-rsc-source")
  ) {
    return;
  }
  // The other project of the run built it already.
  const dist = path.join(framework, "dist");
  if (fs.existsSync(dist) && newest(path.join(framework, "src")) < newest(dist)) return;
  execFileSync("pnpm", ["exec", "tsdown"], { cwd: framework, stdio: "pipe" });
}
