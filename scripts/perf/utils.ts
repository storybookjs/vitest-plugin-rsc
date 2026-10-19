/// <reference types="node" />

import { spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
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

export function numberOption(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Expected a number, received "${value}".`);
  }
  return parsed;
}

/** The items of a comma-separated option, or `undefined` for none. */
export function list(value: string | undefined): string[] | undefined {
  const items = value
    ?.split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return items?.length ? items : undefined;
}

export function formatSeconds(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "n/a";
  return `${value.toFixed(3)}s`;
}

export function formatMilliseconds(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "n/a";
  return `${value.toFixed(2)}ms`;
}

export function median(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

/** Bytes in kB of 1000, as Vite prints the size of a file of a build. */
export function formatKilobytes(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "n/a";
  return `${(value / 1000).toFixed(1)} kB`;
}

export function gitMetadata(cwd: string): Record<string, string> {
  return {
    branch: git(["branch", "--show-current"], cwd),
    sha: git(["rev-parse", "HEAD"], cwd),
  };
}

function git(args: string[], cwd: string): string {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : "unknown";
}
