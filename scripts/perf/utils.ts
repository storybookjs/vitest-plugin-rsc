/// <reference types="node" />

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const repoRoot = path.resolve(fileURLToPath(new URL("../../", import.meta.url)));

export function resolveOutputDir(outputDirFlag: string | undefined, suite: string): string {
  const outputDir =
    outputDirFlag ??
    process.env.PERF_OUTPUT_DIR ??
    path.join(repoRoot, "artifacts", "perf", "local");

  return path.resolve(outputDir, suite);
}

export async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

export async function writeJson(filePath: string, value: unknown): Promise<void> {
  await ensureDir(path.dirname(filePath));
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

export function sanitizeName(name: string): string {
  return name.replaceAll(/[^a-zA-Z0-9._-]+/g, "-").replaceAll(/^-|-$/g, "");
}

export async function readPackageJson(packageRoot: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(path.join(packageRoot, "package.json"), "utf8"));
}

export async function detectPackageRunner(packageRoot: string): Promise<"bun" | "pnpm" | "npm"> {
  const packageJson = await readPackageJson(packageRoot);
  const packageManager = String(packageJson.packageManager ?? "");

  if (packageManager.startsWith("bun@")) return "bun";
  if (packageManager.startsWith("pnpm@")) return "pnpm";
  return "npm";
}

export function numberOption(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Expected a number, received "${value}".`);
  }
  return parsed;
}

export function formatSeconds(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "n/a";
  return `${value.toFixed(3)}s`;
}

export function formatMilliseconds(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "n/a";
  return `${value.toFixed(2)}ms`;
}
