/// <reference types="node" />

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import {
  detectPackageRunner,
  ensureDir,
  formatSeconds,
  numberOption,
  readPackageJson,
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

type EpicPreparation = {
  sourcePath: string;
  preparedPath: string;
  sourceGit: ReturnType<typeof gitMetadata>;
  tarballPath: string;
  tarballSha256: string;
  sourceDistSha256: string;
  installedDistSha256: string;
  installedPackageJson: Record<string, unknown>;
};

async function main(): Promise<void> {
  const { positionals, values } = parseArgs({
    args: process.argv.slice(2).filter((arg) => arg !== "--"),
    allowPositionals: true,
    options: {
      app: { type: "string" },
      coverage: { type: "boolean" },
      label: { type: "string" },
      "output-dir": { type: "string" },
      runs: { type: "string" },
      "show-output": { type: "boolean" },
      smoke: { type: "boolean" },
      warmup: { type: "string" },
      workdir: { type: "string" },
    },
  });

  const mode = positionals[0] ?? "repo";
  if (mode !== "repo" && mode !== "epic") {
    throw new Error(`Unknown benchmark mode "${mode}". Expected "repo" or "epic".`);
  }

  const outputDir = resolveOutputDir(values["output-dir"], "commands");
  const label = values.label ?? process.env.PERF_LABEL ?? mode;
  const runs = numberOption(values.runs ?? process.env.PERF_HYPERFINE_RUNS, 3);
  const warmup = numberOption(values.warmup ?? process.env.PERF_HYPERFINE_WARMUP, 1);

  assertHyperfine();
  await ensureDir(outputDir);

  let epicPreparation: EpicPreparation | undefined;
  const scenarios =
    mode === "epic"
      ? epicScenarios({
          coverage: values.coverage === true || process.env.PERF_EPIC_COVERAGE === "1",
          outputDir,
          runs,
          smoke: values.smoke === true,
          warmup,
        })
      : repoScenarios(runs, warmup);

  if (mode === "epic") {
    epicPreparation = await prepareEpicCandidateApp({
      appPath: resolveEpicSourcePath(values.app),
      outputRoot: path.dirname(outputDir),
      workdir: values.workdir,
    });
    await writeJson(path.join(outputDir, "epic-preparation.json"), epicPreparation);

    for (const scenario of scenarios) {
      scenario.cwd = epicPreparation.preparedPath;
    }
  }

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
    mode,
    createdAt: new Date().toISOString(),
    repo: gitMetadata(repoRoot),
    epicPreparation,
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
  await writeSummary(path.join(outputDir, "summary.md"), label, mode, completed);

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
      name: "nextjs-notes-demo:cold:smoke",
      description: "Cold focused smoke coverage for the Next.js playground.",
      cwd: repoRoot,
      command: [
        "pnpm",
        "--dir",
        "playground/nextjs-notes-demo",
        "exec",
        "vitest",
        "run",
        "components/auth-button.test.tsx",
        "components/note-editor.test.tsx",
      ],
      prepare: [
        "node",
        "-e",
        "fs.rmSync('playground/nextjs-notes-demo/.vite',{recursive:true,force:true})",
      ],
      runs,
      warmup: 0,
    },
    {
      name: "nextjs-notes-demo:warm:smoke",
      description: "Warm focused smoke coverage for the Next.js playground.",
      cwd: repoRoot,
      command: [
        "pnpm",
        "--dir",
        "playground/nextjs-notes-demo",
        "exec",
        "vitest",
        "run",
        "components/auth-button.test.tsx",
        "components/note-editor.test.tsx",
      ],
      runs,
      warmup,
    },
  ];
}

function epicScenarios(options: {
  coverage: boolean;
  outputDir: string;
  runs: number;
  smoke: boolean;
  warmup: number;
}): Scenario[] {
  if (options.smoke) {
    return [
      {
        name: "epic-rsc-stack:smoke:browser-suite",
        description: "One-sample browser project acceptance run for the real-world app.",
        cwd: "",
        command: ["bun", "vitest", "run", "--project=browser"],
        prepare: ["node", "-e", "fs.rmSync('.vite',{recursive:true,force:true})"],
        runs: options.runs,
        warmup: 0,
      },
    ];
  }

  const scenarios: Scenario[] = [
    {
      name: "epic-rsc-stack:cold:browser-suite",
      description: "Cold full browser project run for the real-world acceptance app.",
      cwd: "",
      command: ["bun", "vitest", "run", "--project=browser"],
      prepare: ["node", "-e", "fs.rmSync('.vite',{recursive:true,force:true})"],
      runs: options.runs,
      warmup: 0,
    },
    {
      name: "epic-rsc-stack:warm:browser-suite",
      description: "Warm full browser project run for the real-world acceptance app.",
      cwd: "",
      command: ["bun", "vitest", "run", "--project=browser"],
      runs: options.runs,
      warmup: options.warmup,
    },
  ];

  if (options.coverage) {
    scenarios.push({
      name: "epic-rsc-stack:warm:browser-coverage",
      description: "Warm browser project run with coverage enabled in the real-world app.",
      cwd: "",
      command: [
        "bun",
        "vitest",
        "run",
        "--project=browser",
        "--coverage",
        "--coverage.reporter=json-summary",
        `--coverage.reportsDirectory=${path.join(options.outputDir, "epic-coverage")}`,
      ],
      runs: options.runs,
      warmup: options.warmup,
    });
  }

  return scenarios;
}

function resolveEpicSourcePath(appFlag: string | undefined): string {
  return path.resolve(
    appFlag ?? process.env.EPIC_RSC_STACK_PATH ?? path.join(repoRoot, "..", "epic-rsc-stack"),
  );
}

async function prepareEpicCandidateApp(options: {
  appPath: string;
  outputRoot: string;
  workdir: string | undefined;
}): Promise<EpicPreparation> {
  if (!existsSync(path.join(options.appPath, "package.json"))) {
    throw new Error(
      `Cannot find epic-rsc-stack package.json at ${options.appPath}. Pass --app or EPIC_RSC_STACK_PATH.`,
    );
  }
  if ((await detectPackageRunner(options.appPath)) !== "bun") {
    throw new Error("epic-rsc-stack is expected to use Bun for dependency installation.");
  }

  const preparedPath = path.resolve(
    options.workdir ?? path.join(options.outputRoot, "epic-rsc-stack-candidate"),
  );
  const packageDir = path.join(options.outputRoot, "packages");

  console.log("Building and packing vitest-plugin-rsc candidate");
  run("pnpm", ["build"], repoRoot);
  await rm(packageDir, { recursive: true, force: true });
  await mkdir(packageDir, { recursive: true });
  run(
    "pnpm",
    ["--dir", "packages/vitest-plugin-rsc", "pack", "--pack-destination", packageDir],
    repoRoot,
  );

  const tarballPath = await findOnlyTarball(packageDir);

  console.log(`Preparing epic-rsc-stack candidate workspace at ${preparedPath}`);
  await rm(preparedPath, { recursive: true, force: true });
  await cp(options.appPath, preparedPath, {
    recursive: true,
    filter: (source) => !isIgnoredEpicCopyPath(options.appPath, source),
  });

  await pointEpicAtCandidatePackage(preparedPath, tarballPath);
  run("bun", ["install", "--no-cache", "--ignore-scripts"], preparedPath);
  await rm(path.join(preparedPath, ".vite"), { recursive: true, force: true });

  const installedPackageJson = await readPackageJson(
    path.join(preparedPath, "node_modules", "vitest-plugin-rsc"),
  );
  const sourceDistSha256 = await hashDirectory(
    path.join(repoRoot, "packages", "vitest-plugin-rsc", "dist"),
  );
  const installedDistSha256 = await hashDirectory(
    path.join(preparedPath, "node_modules", "vitest-plugin-rsc", "dist"),
  );

  if (sourceDistSha256 !== installedDistSha256) {
    throw new Error("Installed epic candidate package dist does not match the packed local build.");
  }

  return {
    sourcePath: options.appPath,
    preparedPath,
    sourceGit: gitMetadata(options.appPath),
    tarballPath,
    tarballSha256: await hashFile(tarballPath),
    sourceDistSha256,
    installedDistSha256,
    installedPackageJson,
  };
}

function isIgnoredEpicCopyPath(sourceRoot: string, source: string): boolean {
  const relative = path.relative(sourceRoot, source);
  if (!relative) return false;
  if (relative === ".env" || relative.startsWith(".env.")) return true;
  const firstSegment = relative.split(path.sep)[0];
  return new Set([".git", ".next", ".vite", "coverage", "node_modules"]).has(firstSegment);
}

async function pointEpicAtCandidatePackage(
  preparedPath: string,
  tarballPath: string,
): Promise<void> {
  const packageJsonPath = path.join(preparedPath, "package.json");
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8")) as {
    devDependencies?: Record<string, string>;
  };
  const devDependencies = packageJson.devDependencies ?? {};
  const relativeTarball = path.relative(preparedPath, tarballPath).split(path.sep).join("/");

  devDependencies["vitest-plugin-rsc"] = `file:${relativeTarball}`;
  packageJson.devDependencies = devDependencies;

  await writeFile(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
}

async function findOnlyTarball(packageDir: string): Promise<string> {
  const entries = await readdir(packageDir);
  const tarballs = entries.filter((entry) => entry.endsWith(".tgz"));
  if (tarballs.length !== 1) {
    throw new Error(`Expected one packed tarball in ${packageDir}, found ${tarballs.length}.`);
  }
  return path.join(packageDir, tarballs[0]);
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
  mode: string,
  completed: { scenario: Scenario; jsonPath: string; result: HyperfineResult }[],
): Promise<void> {
  const lines = [
    `# Performance Command Summary`,
    ``,
    `Label: ${label}`,
    `Mode: ${mode}`,
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

async function hashDirectory(dir: string): Promise<string> {
  const hash = createHash("sha256");
  for (const file of await listFiles(dir)) {
    hash.update(path.relative(dir, file));
    hash.update("\0");
    hash.update(await readFile(file));
    hash.update("\0");
  }
  return hash.digest("hex");
}

async function listFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(dir, entry.name);
      return entry.isDirectory() ? listFiles(entryPath) : [entryPath];
    }),
  );
  return files.flat().sort();
}

async function hashFile(file: string): Promise<string> {
  return createHash("sha256")
    .update(await readFile(file))
    .digest("hex");
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
