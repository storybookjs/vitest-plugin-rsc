import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { fetchNext } from "./fetch.ts";
import { fixtures, type Fixture } from "./fixtures.ts";
import type { Report } from "./reporter.ts";
import {
  compare,
  readExpectations,
  renderDocument,
  renderSummary,
  updateExpectations,
  writeExpectations,
  type FixtureRun,
  type TestRun,
} from "./report.ts";

// Runs fixtures of Next's own e2e tests against the plugin, and says how the
// result differs from what `expectations.json` says it is. See
// docs/next-conformance.md.

const here = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
const unsupportedMarker = "[next-conformance:unsupported]";

const { values: options, positionals: filters } = parseArgs({
  allowPositionals: true,
  options: {
    update: { type: "boolean", default: false },
    docs: { type: "boolean", default: false },
    plugin: { type: "string" },
    mode: { type: "string", default: "start" },
    concurrency: { type: "string", default: "4" },
    timeout: { type: "string", default: "30" },
    "test-timeout": { type: "string", default: "60" },
    label: { type: "string" },
    grep: { type: "string" },
    print: { type: "boolean", default: false },
    help: { type: "boolean", default: false },
  },
});

if (options.help) {
  console.log(
    [
      "pnpm conformance [fixture...] [options]",
      "",
      "  fixture            Run the fixtures whose id has one of these in it. Default: all.",
      "  --update           Write what this run found to expectations.json.",
      "  --docs             Write the results to docs/next-conformance.md. Needs a run of all fixtures.",
      "  --plugin <dir>     Run the plugin of another checkout of this repository.",
      "  --mode <mode>      What the tests take the run for: start (default) or dev.",
      "  --concurrency <n>  Fixtures to run at a time. Default: 4.",
      "  --timeout <min>    Minutes a fixture gets. Default: 30.",
      "  --test-timeout <s> Seconds a test gets. Default: 60, as in Next's own runs.",
      "  --label <name>     The name of the results file in .results/. Default: the mode.",
      "  --grep <pattern>   Run the tests whose name matches, to look into one. The others count as skipped.",
      "  --print            Put what the page and the server log in the output of the fixture.",
    ].join("\n"),
  );
  process.exit(0);
}

const selected = fixtures.filter(
  (fixture) => filters.length === 0 || filters.some((filter) => fixture.id.includes(filter)),
);
if (selected.length === 0) {
  console.error(
    `No fixture matches ${filters.join(", ")}. The fixtures: ${fixtures.map(({ id }) => id).join(", ")}`,
  );
  process.exit(1);
}
if (options.mode !== "start" && options.mode !== "dev") {
  console.error(`--mode is start or dev, not ${options.mode}`);
  process.exit(1);
}
const pluginCheckout = options.plugin ? path.resolve(options.plugin) : undefined;
// The expectations are of every test of a fixture, of this plugin, in start mode.
if (options.update && (options.grep || pluginCheckout || options.mode !== "start")) {
  console.error(
    "--update does not go with --grep, --plugin or --mode dev: the run is not one the expectations are of.",
  );
  process.exit(1);
}
if (pluginCheckout && !fs.existsSync(path.join(pluginCheckout, "node_modules/vitest-plugin-rsc"))) {
  console.error(
    `${pluginCheckout} is not an installed checkout of this repository: run \`pnpm install\` in it.`,
  );
  process.exit(1);
}

const nextVersion = (require("next/package.json") as { version: string }).version;
// Every fixture, also for a run of a few: the checkout is the same for all runs.
const checkout = fetchNext(
  path.join(here, ".next-repo"),
  `v${nextVersion}`,
  Array.from(new Set(fixtures.map((fixture) => fixture.dir))),
);
const work = path.join(here, ".work");
const vitest = path.join(path.dirname(require.resolve("vitest/package.json")), "vitest.mjs");

function runFixture(fixture: Fixture): Promise<FixtureRun> {
  // A copy, as Next's own setup makes one: the fixture stays as it was
  // fetched, and the app has a `package.json` of its own, which says its
  // `.js` files are CommonJS.
  const root = path.join(work, "apps", fixture.id);
  fs.rmSync(root, { recursive: true, force: true });
  fs.cpSync(path.join(checkout, fixture.dir), root, { recursive: true });
  for (const file of fixture.prepared?.remove ?? [])
    fs.rmSync(path.join(root, file), { recursive: true });
  if (!fs.existsSync(path.join(root, "package.json"))) {
    fs.writeFileSync(
      path.join(root, "package.json"),
      JSON.stringify({ name: fixture.id, private: true }),
    );
  }
  const resultFile = path.join(work, "results", `${fixture.id}.json`);
  const logFile = path.join(work, "logs", `${fixture.id}.log`);
  for (const file of [resultFile, logFile]) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.rmSync(file, { force: true });
  }

  const started = performance.now();
  const log = fs.openSync(logFile, "w");
  const child = spawn(
    process.execPath,
    [
      vitest,
      "run",
      "--configLoader",
      "native",
      "--config",
      path.join(here, "vitest.config.ts"),
      ...(options.grep ? ["--testNamePattern", options.grep] : []),
    ],
    {
      // Where `next build` runs: Next resolves what `next.config` imports from here.
      cwd: root,
      env: {
        ...process.env,
        // The source of the plugin, so that a run needs no build of it.
        NODE_OPTIONS:
          `${process.env.NODE_OPTIONS ?? ""} --conditions=vitest-plugin-rsc-source`.trim(),
        NEXT_CONFORMANCE_ROOT: root,
        NEXT_CONFORMANCE_TESTS: JSON.stringify(fixture.tests),
        NEXT_CONFORMANCE_TEST_LIB: path.join(checkout, "test/lib"),
        NEXT_CONFORMANCE_CACHE: path.join(work, "cache", fixture.id),
        NEXT_CONFORMANCE_RESULT: resultFile,
        NEXT_CONFORMANCE_MODE: options.mode,
        NEXT_CONFORMANCE_TEST_TIMEOUT: options["test-timeout"],
        NEXT_CONFORMANCE_ASSUME_INSTALLED: JSON.stringify(fixture.assumeInstalled ?? []),
        NEXT_CONFORMANCE_PREPARED: JSON.stringify(fixture.prepared?.options ?? []),
        NEXT_CONFORMANCE_PLUGIN: pluginCheckout ?? "",
        NEXT_CONFORMANCE_PRINT: options.print ? "1" : "",
        CI: "1",
      },
      stdio: ["ignore", log, log],
      // A group of its own, to stop the browser with it.
      detached: true,
    },
  );

  return new Promise((resolve) => {
    let timedOut = false;
    const timer = setTimeout(
      () => {
        timedOut = true;
        try {
          process.kill(-child.pid!, "SIGKILL");
        } catch {}
      },
      Number(options.timeout) * 60_000,
    );
    child.on("close", () => {
      clearTimeout(timer);
      fs.closeSync(log);
      const duration = Math.round(performance.now() - started);
      const report = fs.existsSync(resultFile)
        ? (JSON.parse(fs.readFileSync(resultFile, "utf8")) as Report)
        : undefined;
      // Without a report the run did not get to its tests: the plugin
      // rejected the app, or Vitest did not start. That is one failure, and
      // so is a test file that did not load.
      const tests = (report?.tests ?? []).map(toTestRun).map(uniqueIds());
      for (const { file, message } of report?.errors ?? []) {
        tests.push({ id: `${file} > (the test file did not load)`, state: "failed", message });
      }
      const failure = timedOut
        ? `the fixture did not finish in ${options.timeout} minutes`
        : !report
          ? startupError(fs.readFileSync(logFile, "utf8"))
          : !report.finished
            ? "the run of the fixture stopped before its last test"
            : tests.length === 0
              ? "no test ran"
              : undefined;
      if (failure)
        tests.push({
          id: "(the fixture did not run to its end)",
          state: "failed",
          message: failure,
        });
      resolve({ fixture, duration, failure, tests });
    });
  });
}

// The colors of a terminal.
const ansi = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");

function startupError(output: string): string {
  const plain = output.replace(ansi, "");
  const start = plain.search(/Startup Error|Error:/);
  return (start >= 0 ? plain.slice(start) : plain.slice(-1500))
    .trim()
    .split("\n")
    .slice(0, 12)
    .join("\n");
}

function toTestRun(test: Report["tests"][number]): TestRun {
  const message = test.message?.replace(ansi, "");
  const marker = message?.indexOf(unsupportedMarker) ?? -1;
  return {
    id: `${test.file} > ${test.name}`,
    state: test.state,
    message,
    // What the runner could not give the test, as the shim says it.
    unsupported:
      test.state === "failed" && marker >= 0
        ? message!
            .slice(marker + unsupportedMarker.length)
            .trim()
            .split("\n")[0]
        : undefined,
    duration: test.duration,
  };
}

// Two tests of a file can have the same name, from a loop.
function uniqueIds() {
  const seen = new Map<string, number>();
  return (test: TestRun): TestRun => {
    const count = (seen.get(test.id) ?? 0) + 1;
    seen.set(test.id, count);
    return count === 1 ? test : { ...test, id: `${test.id} #${count}` };
  };
}

async function runAll(): Promise<FixtureRun[]> {
  const runs: FixtureRun[] = [];
  const queue = [...selected];
  const worker = async () => {
    for (let fixture = queue.shift(); fixture; fixture = queue.shift()) {
      const run = await runFixture(fixture);
      runs.push(run);
      const passed = run.tests.filter((test) => test.state === "passed").length;
      const failed = run.tests.filter((test) => test.state === "failed").length;
      console.log(
        `${run.failure ? "✗" : "·"} ${fixture.id.padEnd(36)} ` +
          `${String(passed).padStart(3)} passed ${String(failed).padStart(3)} failed ` +
          `${(run.duration / 1000).toFixed(0).padStart(4)}s` +
          (run.failure ? `  ${run.failure.split("\n")[0]}` : ""),
      );
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Number(options.concurrency)) }, worker));
  return selected.map((fixture) => runs.find((run) => run.fixture === fixture)!);
}

console.log(
  `next@${nextVersion}, ${selected.length} of ${fixtures.length} fixtures, mode ${options.mode}` +
    (pluginCheckout ? `, the plugin of ${pluginCheckout}` : ""),
);
const runs = await runAll();

const resultsFile = path.join(here, ".results", `${options.label ?? options.mode}.json`);
fs.mkdirSync(path.dirname(resultsFile), { recursive: true });
fs.writeFileSync(
  resultsFile,
  JSON.stringify(
    { next: nextVersion, mode: options.mode, plugin: pluginCheckout ?? null, runs },
    null,
    2,
  ),
);

const expectationsFile = path.join(here, "expectations.json");
let expectations = readExpectations(expectationsFile);
if (options.update) {
  expectations = updateExpectations(expectations, runs);
  writeExpectations(expectationsFile, expectations);
}
const comparison = compare(expectations, runs);
console.log(renderSummary(comparison, runs));
console.log(
  `\nThe results are in ${path.relative(process.cwd(), resultsFile)}, the output of each fixture in ${path.relative(process.cwd(), path.join(work, "logs"))}.`,
);

if (options.docs) {
  if (selected.length !== fixtures.length || options.mode !== "start" || pluginCheckout) {
    console.error(
      "--docs needs a run of every fixture, in start mode, of the plugin of this checkout.",
    );
    process.exit(1);
  }
  const documentFile = path.join(here, "../docs/next-conformance.md");
  fs.writeFileSync(
    documentFile,
    renderDocument(fs.readFileSync(documentFile, "utf8"), comparison, runs, nextVersion),
  );
  // As `pnpm format` leaves it: the tables are written without their padding.
  execFileSync("pnpm", ["--workspace-root", "exec", "oxfmt", documentFile], { stdio: "inherit" });
  console.log(`Wrote the results to ${path.relative(process.cwd(), documentFile)}.`);
}

process.exit(comparison.unexpected.length > 0 ? 1 : 0);
