import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import type { BrowserCommand, Reporter, TestCase, TestModule } from "vitest/node";

// The Node side of the benchmark of primitives: the browser commands that
// bench/harness.ts sends its rows with, and a reporter that marks the startup
// of the run and, at its end, prints every row as a Markdown table and
// writes them as JSON to bench-results/<label>.json (and the tables to
// bench-results/<label>.md), for bench/compare.py.

type Stats = { n: number; first: number; min: number; median: number; p90: number; max: number };
type Row = {
  name: string;
  mode: string;
  iterations: number;
  warmup: number;
  total: Stats;
  parts: Record<string, Stats>;
  requests?: Record<string, number>;
  note?: string;
};
type Mark = { label: string; epoch: number };

const epoch = () => performance.timeOrigin + performance.now();
const marks: Mark[] = [];
const mark = (label: string, at = epoch()) => marks.push({ label, epoch: at });
const rows: Row[] = [];
// When Vite transformed each module, for the startup table.
const transforms: number[] = [];

// oxlint-disable-next-line no-process-env
const env = process.env;
/** `fast` or `fidelity`, with `-development` for that build of Next and React. */
export const benchMode = `${env.VITEST_PLUGIN_RSC_MODE === "fast" ? "fast" : "fidelity"}${
  env.VITEST_PLUGIN_RSC_BUILD === "development" ? "-development" : ""
}`;
const label = env.BENCH_LABEL || benchMode;

mark("node: process start (performance.timeOrigin)", performance.timeOrigin);
// The shell's time as it started the command, in ms: `BENCH_SHELL_START=$(date +%s%3N)`,
// with GNU `date` (`gdate` on macOS, whose `date` has no `%N`).
if (env.BENCH_SHELL_START) mark("shell: command start", Number(env.BENCH_SHELL_START));

/** Marks that vitest.bench.config.ts has been evaluated. */
export function configEvaluated(): void {
  mark("node: vitest.bench.config.ts evaluated");
}

type Handler = (
  req: { url?: string },
  res: { once(event: "finish", listener: () => void): void },
  next: () => void,
) => void;

/**
 * A Vite plugin that marks the steps of Vite's startup: the config hooks
 * (its own runs first, the plugins' after it, until configResolved), the
 * server, when it listens, and the first module each environment transformed.
 */
export function startupMarks() {
  const transformed = new Set<string>();
  return {
    name: "bench-startup-marks",
    enforce: "pre" as const,
    config: () => void mark("vite: config hooks start"),
    configResolved: () => void mark("vite: configResolved"),
    configureServer: (server: {
      middlewares: { stack: { route: string; handle: Handler }[] };
      httpServer: { once(event: "listening", listener: () => void): void } | null;
    }) => {
      mark("vite: configureServer");
      server.httpServer?.once("listening", () => mark("vite: server listening"));
      // The first request of the tester's page, which Vitest serves itself at
      // `/?sessionId=`, and when it was served: first in the stack, before
      // Vitest's own middlewares, which answer it.
      let tester = false;
      server.middlewares.stack.unshift({
        route: "",
        handle: (req, res, next) => {
          if (!tester && /^\/\?(.*&)?sessionId=/.test(req.url ?? "")) {
            tester = true;
            mark("vite: tester page requested");
            res.once("finish", () => mark("vite: tester page served"));
          }
          next();
        },
      });
      return () => void mark("vite: configureServer, after Vite's middlewares");
    },
    buildStart: () => void mark("vite: buildStart"),
    transform(this: { environment?: { name: string } }) {
      transforms.push(epoch());
      const environment = this.environment?.name ?? "?";
      if (transformed.has(environment)) return;
      transformed.add(environment);
      mark(`vite: first module of the ${environment} environment transformed`);
    },
  };
}

export const benchCommands = {
  benchResult: (async (_context, json: string) => {
    rows.push(JSON.parse(json) as Row);
  }) satisfies BrowserCommand<[json: string]>,
  benchMarks: (async (_context, json: string) => {
    for (const [name, at] of JSON.parse(json) as [string, number][]) mark(name, at);
  }) satisfies BrowserCommand<[json: string]>,
};

const ms = (value: number) => (Math.abs(value) >= 100 ? value.toFixed(0) : value.toFixed(2));

function table(all: Row[]): string {
  const lines: string[] = [];
  let group = "";
  for (const row of all) {
    const [head, ...rest] = row.name.split(" › ");
    if (head !== group) {
      group = head!;
      lines.push(
        "",
        `#### ${group}`,
        "",
        "| Primitive | n | first | min | median | p90 | max | requests/iteration |",
        "| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |",
      );
    }
    const requests = Object.entries(row.requests ?? {})
      .map(([kind, count]) => `${kind} ${count.toFixed(2)}`)
      .join(", ");
    const cells = (name: string, stats: Stats, extra = "") =>
      `| ${name} | ${stats.n} | ${ms(stats.first)} | ${ms(stats.min)} | ${ms(stats.median)} | ${ms(
        stats.p90,
      )} | ${ms(stats.max)} | ${extra} |`;
    lines.push(cells(rest.join(" › ") || head!, row.total, requests));
    for (const [part, stats] of Object.entries(row.parts)) lines.push(cells(`↳ ${part}`, stats));
  }
  return lines.join("\n");
}

function startupTable(firstModule: TestModule | undefined, modules: readonly TestModule[]) {
  const sorted = [...marks].sort((a, b) => a.epoch - b.epoch);
  const origin =
    marks.find((entry) => entry.label.startsWith("shell:"))?.epoch ?? performance.timeOrigin;
  const lines = [
    "#### Startup",
    "",
    "| Mark | ms since start | ms since the mark before | modules Vite transformed since the mark before |",
    "| --- | ---: | ---: | ---: |",
  ];
  let before = origin;
  for (const { label: name, epoch: at } of sorted) {
    const count = transforms.filter((time) => time > before && time <= at).length;
    lines.push(`| ${name} | ${ms(at - origin)} | ${ms(at - before)} | ${count} |`);
    before = at;
  }
  const diagnostics = modules.map((module) => module.diagnostic());
  const first = firstModule?.diagnostic();
  if (first) {
    const others = modules.filter((module) => module !== firstModule).map((m) => m.diagnostic());
    const median = (values: number[]) => {
      const sorted = [...values].sort((a, b) => a - b);
      return sorted.length ? sorted[Math.floor(sorted.length / 2)]! : NaN;
    };
    lines.push(
      "",
      "| Vitest's diagnostic of a test file, ms | first file | median of the others |",
      "| --- | ---: | ---: |",
    );
    for (const key of [
      "environmentSetupDuration",
      "prepareDuration",
      "setupDuration",
      "collectDuration",
    ] as const) {
      lines.push(`| ${key} | ${ms(first[key])} | ${ms(median(others.map((d) => d[key])))} |`);
    }
  }
  return { text: lines.join("\n"), marks: sorted, origin, diagnostics };
}

export class BenchReporter implements Reporter {
  private firstModule: string | undefined;
  private seen = new Set<string>();
  private once(name: string) {
    if (this.seen.has(name)) return;
    this.seen.add(name);
    mark(name);
  }
  onInit() {
    this.once("node: reporter onInit");
  }
  onBrowserInit() {
    this.once("node: reporter onBrowserInit (browser launched)");
  }
  onTestRunStart() {
    this.once("node: reporter onTestRunStart");
  }
  onTestModuleQueued(module: TestModule) {
    this.firstModule ??= module.moduleId;
    this.once("node: first onTestModuleQueued");
  }
  onTestModuleCollected() {
    this.once("node: first onTestModuleCollected");
  }
  onTestCaseReady(_test: TestCase) {
    this.once("node: first onTestCaseReady");
  }
  onTestCaseResult(_test: TestCase) {
    this.once("node: first onTestCaseResult");
  }
  onTestRunEnd(modules: readonly TestModule[]) {
    mark("node: onTestRunEnd");
    const first = modules.find((module) => module.moduleId === this.firstModule);
    const startup = startupTable(first, modules);
    const order = (row: Row) => row.name;
    const sorted = [...rows].sort((a, b) => order(a).localeCompare(order(b)));
    const text = [
      `### Primitives, ${label}`,
      "",
      "Milliseconds per iteration, by `performance.now()` in the page; `first` is the first, untimed warmup iteration.",
      "",
      startup.text,
      table(sorted),
      "",
    ].join("\n");
    process.stdout.write(`\n${text}\n`);
    let commit = "";
    try {
      commit = execFileSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim();
    } catch {}
    mkdirSync("bench-results", { recursive: true });
    writeFileSync(
      `bench-results/${label}.json`,
      `${JSON.stringify(
        {
          label,
          mode: benchMode,
          commit,
          date: new Date().toISOString(),
          node: process.version,
          startup: {
            marks: startup.marks.map(({ label: name, epoch: at }) => ({
              label: name,
              ms: at - startup.origin,
            })),
            files: modules.map((module, i) => ({
              file: module.moduleId,
              ...startup.diagnostics[i],
            })),
          },
          rows: sorted,
        },
        null,
        2,
      )}\n`,
    );
    writeFileSync(`bench-results/${label}.md`, text);
  }
}
