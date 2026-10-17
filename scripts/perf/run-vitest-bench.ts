/// <reference types="node" />

import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import {
  ensureDir,
  formatMilliseconds,
  gitMetadata,
  repoRoot,
  resolveOutputDir,
  writeJson,
} from "./utils.ts";

// Vitest 5 reports benchmarks through the JSON reporter, per test.
type BenchmarkReport = {
  testResults?: {
    name?: string;
    assertionResults?: {
      fullName?: string;
      benchmarks?: {
        name?: string;
        tasks?: BenchmarkTask[];
      }[];
    }[];
  }[];
};

type BenchmarkTask = {
  name?: string;
  latency?: { mean?: number; rme?: number; samplesCount?: number };
  throughput?: { mean?: number };
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
  runVitestBench(outputJson);

  await writeJson(path.join(outputDir, "metadata.json"), {
    createdAt: new Date().toISOString(),
    repo: gitMetadata(repoRoot),
    outputJson,
    compareJson,
  });
  await writeSummary(path.join(outputDir, "summary.md"), outputJson, compareJson);

  console.log(`Wrote Vitest benchmark artifacts to ${path.relative(repoRoot, outputDir)}`);
}

function runVitestBench(outputJson: string): void {
  const command = [
    "--dir",
    "playground/rsc-vitest-demo",
    "exec",
    "vitest",
    "bench",
    "src/perf/render.bench.tsx",
    "--reporter=default",
    "--reporter=json",
    `--outputFile.json=${outputJson}`,
  ];

  const result = spawnSync("pnpm", command, {
    cwd: repoRoot,
    stdio: "inherit",
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Vitest bench failed with exit code ${result.status}`);
  }
}

async function writeSummary(
  summaryPath: string,
  outputJson: string,
  compareJson: string | undefined,
): Promise<void> {
  const report = await readReport(outputJson);
  const baseline = compareJson ? meansByName(await readReport(compareJson)) : undefined;
  const lines = [
    `# Vitest Benchmark Summary`,
    ``,
    `Created: ${new Date().toISOString()}`,
    ``,
    `These timings are informational. The suite fails on benchmark execution errors, not on timing deltas.`,
    ``,
  ];

  for (const file of report.testResults ?? []) {
    for (const test of file.assertionResults ?? []) {
      for (const group of test.benchmarks ?? []) {
        lines.push(`## ${group.name ?? test.fullName ?? file.name ?? "benchmark"}`, ``);
        for (const task of group.tasks ?? []) {
          const mean = task.latency?.mean;
          const baselineMean = task.name ? baseline?.get(task.name) : undefined;
          lines.push(
            `- ${task.name ?? "unnamed"}: mean ${formatMilliseconds(mean)}, hz ${formatHz(
              task.throughput?.mean,
            )}, rme ${formatPercent(task.latency?.rme)}, samples ${
              task.latency?.samplesCount ?? 0
            }${baselineMean === undefined ? "" : `, vs baseline ${formatDelta(mean, baselineMean)}`}`,
          );
        }
        lines.push(``);
      }
    }
  }

  await writeFile(summaryPath, `${lines.join("\n")}\n`);
}

async function readReport(file: string): Promise<BenchmarkReport> {
  return JSON.parse(await readFile(file, "utf8")) as BenchmarkReport;
}

function meansByName(report: BenchmarkReport): Map<string, number> {
  const means = new Map<string, number>();
  for (const file of report.testResults ?? []) {
    for (const test of file.assertionResults ?? []) {
      for (const group of test.benchmarks ?? []) {
        for (const task of group.tasks ?? []) {
          if (task.name && typeof task.latency?.mean === "number") {
            means.set(task.name, task.latency.mean);
          }
        }
      }
    }
  }
  return means;
}

function formatDelta(mean: unknown, baselineMean: number): string {
  if (typeof mean !== "number" || !Number.isFinite(mean) || baselineMean === 0) return "n/a";
  const delta = ((mean - baselineMean) / baselineMean) * 100;
  return `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}%`;
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
