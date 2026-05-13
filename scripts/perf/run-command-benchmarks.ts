/// <reference types="node" />

import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import {
  ensureDir,
  formatSeconds,
  numberOption,
  repoRoot,
  resolveOutputDir,
  sanitizeName,
  writeJson,
} from "./utils.ts";

type Scenario = {
  name: string;
  description: string;
  cwd: string;
  command: string[];
  prepare?: string[];
  runs: number;
  warmup: number;
};

type HyperfineResult = {
  command: string;
  mean?: number;
  stddev?: number;
  median?: number;
  min?: number;
  max?: number;
};

async function main(): Promise<void> {
  const { values } = parseArgs({
    args: process.argv.slice(2).filter((arg) => arg !== "--"),
    allowPositionals: true,
    options: {
      label: { type: "string" },
      "output-dir": { type: "string" },
      runs: { type: "string" },
      "show-output": { type: "boolean" },
      warmup: { type: "string" },
    },
  });

  const outputDir = resolveOutputDir(values["output-dir"], "commands");
  const label = values.label ?? process.env.PERF_LABEL ?? "repo";
  const runs = numberOption(values.runs ?? process.env.PERF_HYPERFINE_RUNS, 3);
  const warmup = numberOption(values.warmup ?? process.env.PERF_HYPERFINE_WARMUP, 1);

  assertHyperfine();
  await ensureDir(outputDir);

  const scenarios = repoScenarios(runs, warmup);

  const completed: { scenario: Scenario; jsonPath: string; result: HyperfineResult }[] = [];
  for (const scenario of scenarios) {
    const jsonPath = path.join(outputDir, `${sanitizeName(scenario.name)}.hyperfine.json`);
    runHyperfine(scenario, jsonPath, values["show-output"] === true);
    completed.push({
      scenario,
      jsonPath,
      result: await readHyperfineResult(jsonPath),
    });
  }

  await writeJson(path.join(outputDir, "metadata.json"), {
    label,
    createdAt: new Date().toISOString(),
    repo: gitMetadata(repoRoot),
    scenarios: scenarios.map(({ name, description, cwd, command, prepare, runs, warmup }) => ({
      name,
      description,
      cwd,
      command,
      prepare,
      runs,
      warmup,
    })),
  });
  await writeSummary(path.join(outputDir, "summary.md"), label, completed);

  console.log(`Wrote command benchmark artifacts to ${path.relative(repoRoot, outputDir)}`);
}

function repoScenarios(runs: number, warmup: number): Scenario[] {
  return [
    {
      name: "rsc-vitest-demo:cold:all-tests",
      description: "Cold browser-mode Vitest run for the core RSC playground.",
      cwd: repoRoot,
      command: ["pnpm", "--dir", "playground/rsc-vitest-demo", "exec", "vitest", "run"],
      prepare: [
        "node",
        "-e",
        "fs.rmSync('playground/rsc-vitest-demo/.vite',{recursive:true,force:true})",
      ],
      runs,
      warmup: 0,
    },
    {
      name: "rsc-vitest-demo:warm:all-tests",
      description: "Warm browser-mode Vitest run for the core RSC playground.",
      cwd: repoRoot,
      command: ["pnpm", "--dir", "playground/rsc-vitest-demo", "exec", "vitest", "run"],
      runs,
      warmup,
    },
    {
      name: "rsc-vitest-demo:warm:actions-payload",
      description: "Warm focused RSC action, payload, and client boundary coverage.",
      cwd: repoRoot,
      command: [
        "pnpm",
        "--dir",
        "playground/rsc-vitest-demo",
        "exec",
        "vitest",
        "run",
        "src/action/server.test.tsx",
        "src/action-bind/server.test.tsx",
        "src/action-from-client/client.test.tsx",
        "src/payload/server.test.tsx",
      ],
      runs,
      warmup,
    },
    {
      name: "nextjs-notes-demo:cold:all-tests",
      description: "Cold full Vitest run for the Next.js notes demo (acceptance baseline).",
      cwd: repoRoot,
      command: ["pnpm", "--dir", "playground/nextjs-notes-demo", "exec", "vitest", "run"],
      prepare: [
        "node",
        "-e",
        "fs.rmSync('playground/nextjs-notes-demo/.vite',{recursive:true,force:true})",
      ],
      runs,
      warmup: 0,
    },
    {
      name: "nextjs-notes-demo:warm:all-tests",
      description: "Warm full Vitest run for the Next.js notes demo (acceptance baseline).",
      cwd: repoRoot,
      command: ["pnpm", "--dir", "playground/nextjs-notes-demo", "exec", "vitest", "run"],
      runs,
      warmup,
    },
  ];
}

function assertHyperfine(): void {
  const result = spawnSync("hyperfine", ["--version"], { encoding: "utf8" });
  if (result.error) {
    throw new Error(
      "hyperfine is required for command benchmarks. Install it with your system package manager, then rerun the perf script.",
    );
  }
}

function runHyperfine(scenario: Scenario, jsonPath: string, showOutput: boolean): void {
  console.log(`\nBenchmarking ${scenario.name}`);
  const args = [
    "--runs",
    String(scenario.runs),
    "--warmup",
    String(scenario.warmup),
    "--export-json",
    jsonPath,
    "--command-name",
    scenario.name,
  ];

  if (showOutput) args.push("--show-output");
  if (scenario.prepare) args.push("--prepare", quoteCommand(scenario.prepare));
  args.push(quoteCommand(scenario.command));

  run("hyperfine", args, scenario.cwd);
}

function run(command: string, args: string[], cwd: string): void {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}`);
  }
}

function quoteCommand(parts: string[]): string {
  return parts.map(quoteShellArg).join(" ");
}

function quoteShellArg(value: string): string {
  if (/^[A-Za-z0-9_/:=.,@%+-]+$/.test(value)) return value;
  return `'${value.replaceAll("'", "'\\''")}'`;
}

async function readHyperfineResult(jsonPath: string): Promise<HyperfineResult> {
  const report = JSON.parse(await readFile(jsonPath, "utf8")) as { results?: HyperfineResult[] };
  const result = report.results?.[0];
  if (!result) throw new Error(`No hyperfine result found in ${jsonPath}`);
  return result;
}

async function writeSummary(
  summaryPath: string,
  label: string,
  completed: { scenario: Scenario; jsonPath: string; result: HyperfineResult }[],
): Promise<void> {
  const lines = [
    `# Performance Command Summary`,
    ``,
    `Label: ${label}`,
    `Created: ${new Date().toISOString()}`,
    ``,
    `These timings are informational. The suite fails on command errors, not on timing deltas.`,
    ``,
  ];

  for (const { scenario, jsonPath, result } of completed) {
    lines.push(
      `## ${scenario.name}`,
      ``,
      scenario.description,
      ``,
      `- mean: ${formatSeconds(result.mean)}`,
      `- median: ${formatSeconds(result.median)}`,
      `- min/max: ${formatSeconds(result.min)} / ${formatSeconds(result.max)}`,
      `- stddev: ${formatSeconds(result.stddev)}`,
      `- runs: ${scenario.runs}`,
      `- warmup runs: ${scenario.warmup}`,
      `- artifact: ${path.relative(path.dirname(summaryPath), jsonPath)}`,
      ``,
    );
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

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
