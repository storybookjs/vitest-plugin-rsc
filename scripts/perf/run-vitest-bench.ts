/// <reference types="node" />

import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { ensureDir, formatMilliseconds, repoRoot, resolveOutputDir, writeJson } from "./utils.ts";

type BenchmarkReport = {
  files?: {
    filepath?: string;
    groups?: {
      fullName?: string;
      benchmarks?: {
        name?: string;
        hz?: number;
        mean?: number;
        rme?: number;
        samples?: unknown[];
      }[];
    }[];
  }[];
};

async function main(): Promise<void> {
  const { values } = parseArgs({
    args: process.argv.slice(2).filter((arg) => arg !== "--"),
    options: {
      compare: { type: "string" },
      "output-dir": { type: "string" },
    },
  });

  const outputDir = resolveOutputDir(values["output-dir"], "vitest-bench");
  const outputJson = path.join(outputDir, "render.json");
  const compareJson = values.compare ?? process.env.PERF_VITEST_COMPARE;

  await ensureDir(outputDir);
  runVitestBench(outputJson, compareJson);

  await writeJson(path.join(outputDir, "metadata.json"), {
    createdAt: new Date().toISOString(),
    repo: gitMetadata(repoRoot),
    outputJson,
    compareJson,
  });
  await writeSummary(path.join(outputDir, "summary.md"), outputJson);

  console.log(`Wrote Vitest benchmark artifacts to ${path.relative(repoRoot, outputDir)}`);
}

function runVitestBench(outputJson: string, compareJson: string | undefined): void {
  const command = [
    "--dir",
    "playground/rsc-vitest-demo",
    "exec",
    "vitest",
    "bench",
    "src/perf/render.bench.tsx",
    "--outputJson",
    outputJson,
  ];

  if (compareJson) {
    command.push("--compare", compareJson);
  }

  const result = spawnSync("pnpm", command, {
    cwd: repoRoot,
    stdio: "inherit",
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Vitest bench failed with exit code ${result.status}`);
  }
}

async function writeSummary(summaryPath: string, outputJson: string): Promise<void> {
  const report = JSON.parse(await readFile(outputJson, "utf8")) as BenchmarkReport;
  const lines = [
    `# Vitest Benchmark Summary`,
    ``,
    `Created: ${new Date().toISOString()}`,
    ``,
    `These timings are informational. The suite fails on benchmark execution errors, not on timing deltas.`,
    ``,
  ];

  for (const file of report.files ?? []) {
    for (const group of file.groups ?? []) {
      lines.push(`## ${group.fullName ?? file.filepath ?? "benchmark"}`, ``);
      for (const benchmark of group.benchmarks ?? []) {
        lines.push(
          `- ${benchmark.name ?? "unnamed"}: mean ${formatMilliseconds(
            benchmark.mean,
          )}, hz ${formatHz(benchmark.hz)}, rme ${formatPercent(benchmark.rme)}, samples ${
            benchmark.samples?.length ?? 0
          }`,
        );
      }
      lines.push(``);
    }
  }

  await writeFile(summaryPath, `${lines.join("\n")}\n`);
}

function gitMetadata(cwd: string): Record<string, string> {
  return {
    branch: git(["branch", "--show-current"], cwd),
    sha: git(["rev-parse", "HEAD"], cwd),
  };
}

function git(args: string[], cwd: string): string {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : "unknown";
}

function formatHz(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "n/a";
  return `${value.toFixed(2)}/s`;
}

function formatPercent(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "n/a";
  return `${value.toFixed(2)}%`;
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
