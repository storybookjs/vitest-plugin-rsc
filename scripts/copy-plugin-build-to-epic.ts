/// <reference types="node" />

import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(scriptDir, "..", "packages", "vitest-plugin-rsc");
const sourceDist = join(packageRoot, "dist");
const sourcePackageJson = join(packageRoot, "package.json");
const targetPackageRoot = join(
  homedir(),
  "code",
  "epic-rsc-stack",
  "node_modules",
  "vitest-plugin-rsc",
);
const targetDist = join(targetPackageRoot, "dist");
const targetPackageJson = join(targetPackageRoot, "package.json");

if (!existsSync(sourceDist)) {
  throw new Error(`Missing build output at ${sourceDist}. Run the plugin build first.`);
}

if (!existsSync(targetPackageRoot)) {
  throw new Error(
    `Missing target package at ${targetPackageRoot}. Run install in epic-rsc-stack first.`,
  );
}

rmSync(targetDist, { recursive: true, force: true });
mkdirSync(dirname(targetDist), { recursive: true });
cpSync(sourceDist, targetDist, { recursive: true });
cpSync(sourcePackageJson, targetPackageJson);

console.log(`Copied vitest-plugin-rsc build to ${targetPackageRoot}`);
