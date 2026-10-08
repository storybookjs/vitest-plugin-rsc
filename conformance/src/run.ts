import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { unsupportedMarker } from "../shim/unsupported.ts";
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
      "  --grep <pattern>   Run the tests whose name matches, to look into one.",
      "  --print            Put what the page and the server log in the output of the fixture.",
    ].join("\n"),
  );
  process.exit(0);
}

function refuse(message: string): never {
  console.error(message);
  process.exit(1);
}

function numberOf(name: "concurrency" | "timeout" | "test-timeout"): number {
  const value = Number(options[name]);
  if (!Number.isFinite(value) || value <= 0) {
    refuse(`--${name} is a number above 0, not ${options[name]}`);
  }
  return value;
}
const concurrency = Math.max(1, Math.floor(numberOf("concurrency")));
const fixtureTimeout = numberOf("timeout");
const testTimeout = numberOf("test-timeout");

const selected = fixtures.filter(
  (fixture) => filters.length === 0 || filters.some((filter) => fixture.id.includes(filter)),
);
if (selected.length === 0) {
  refuse(
    `No fixture matches ${filters.join(", ")}. The fixtures: ${fixtures.map(({ id }) => id).join(", ")}`,
  );
}
if (options.mode !== "start" && options.mode !== "dev") {
  refuse(`--mode is start or dev, not ${options.mode}`);
}
const pluginCheckout = options.plugin ? path.resolve(options.plugin) : undefined;
if (pluginCheckout && !fs.existsSync(path.join(pluginCheckout, "node_modules/vitest-plugin-rsc"))) {
  refuse(
    `${pluginCheckout} is not an installed checkout of this repository: run \`pnpm install\` in it.`,
  );
}
// The expectations are of every test of a fixture, of this plugin, in start
// mode. The document is of every fixture too.
const isOfThisPlugin = !options.grep && !pluginCheckout && options.mode === "start";
if (options.update && !isOfThisPlugin) {
  refuse(
    "--update does not go with --grep, --plugin or --mode dev: the run is not one the expectations are of.",
  );
}
if (options.docs && (!isOfThisPlugin || selected.length !== fixtures.length)) {
  refuse(
    "--docs needs a run of every test of every fixture, in start mode, of the plugin of this checkout.",
  );
}
const expectationsFile = path.join(here, "expectations.json");
let expectations = readExpectations(expectationsFile);

const nextVersion = (require("next/package.json") as { version: string }).version;
// Every fixture, also for a run of a few: the checkout is the same for all runs.
const checkout = fetchNext(
  path.join(here, ".next-repo"),
  `v${nextVersion}`,
  Array.from(new Set(fixtures.map((fixture) => fixture.dir))),
);
const work = path.join(here, ".work");
const vitest = path.join(path.dirname(require.resolve("vitest/package.json")), "vitest.mjs");

// A run of a fixture is a process group of its own, so that its browser stops
// with it. So it does not stop with this process by itself.
const running = new Set<ChildProcess>();
function stop(child: ChildProcess): void {
  try {
    process.kill(-child.pid!, "SIGKILL");
  } catch {}
}
process.on("exit", () => running.forEach(stop));
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
  process.on(signal, () => process.exit(130));
}

// A copy, as Next's own setup makes one: the fixture stays as it was fetched,
// and the app has a `package.json` of its own, which says that its `.js` files
// are CommonJS.
function copyFixture(fixture: Fixture): string {
  const root = path.join(work, "apps", fixture.id);
  fs.rmSync(root, { recursive: true, force: true });
  fs.cpSync(path.join(checkout, fixture.dir), root, { recursive: true });
  for (const file of fixture.prepared?.remove ?? []) {
    fs.rmSync(path.join(root, file), { recursive: true });
  }
  for (const test of fixture.tests) {
    if (!fs.existsSync(path.join(root, test))) throw new Error(`${fixture.dir} has no ${test}`);
  }
  if (!fs.existsSync(path.join(root, "package.json"))) {
    fs.writeFileSync(
      path.join(root, "package.json"),
      JSON.stringify({ name: fixture.id, private: true }),
    );
  }
  return root;
}

function runFixture(fixture: Fixture, isSecondRun: boolean): Promise<FixtureRun> {
  const started = performance.now();
  const ended = (failure: string | undefined, tests: TestRun[] = []): FixtureRun => ({
    fixture,
    duration: Math.round(performance.now() - started),
    failure,
    tests,
  });

  let root: string;
  try {
    root = copyFixture(fixture);
  } catch (error) {
    // The fixture is not what `fixtures.ts` says it is, in this Next.js.
    return Promise.resolve(ended(`the fixture could not be copied: ${String(error)}`));
  }
  const resultFile = path.join(work, "results", `${fixture.id}.json`);
  const logFile = path.join(work, "logs", `${fixture.id}.log`);
  const firstLogFile = path.join(work, "logs", `${fixture.id}.first.log`);
  fs.mkdirSync(path.dirname(resultFile), { recursive: true });
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  fs.rmSync(resultFile, { force: true });
  // The output of the run that was not what the expectations say is what
  // tells why.
  fs.rmSync(firstLogFile, { force: true });
  if (isSecondRun && fs.existsSync(logFile)) fs.renameSync(logFile, firstLogFile);

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
        NEXT_CONFORMANCE_TEST_TIMEOUT: String(testTimeout),
        NEXT_CONFORMANCE_ASSUME_INSTALLED: JSON.stringify(fixture.assumeInstalled ?? []),
        NEXT_CONFORMANCE_PREPARED: JSON.stringify(fixture.prepared?.options ?? []),
        NEXT_CONFORMANCE_PLUGIN: pluginCheckout ?? "",
        NEXT_CONFORMANCE_PRINT: options.print ? "1" : "",
        CI: "1",
      },
      stdio: ["ignore", log, log],
      detached: true,
    },
  );
  running.add(child);

  return new Promise((resolve) => {
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      stop(child);
    }, fixtureTimeout * 60_000);
    const end = (failure?: string, tests?: TestRun[]) => {
      clearTimeout(timer);
      running.delete(child);
      fs.closeSync(log);
      resolve(ended(failure, tests));
    };
    child.on("error", (error) => end(`Vitest did not start: ${String(error)}`));
    child.on("close", () => {
      const report = readReport(resultFile);
      const tests = (report?.tests ?? []).map(toTestRun).map(uniqueIds());
      // Without a report the run did not get to its tests: the plugin
      // rejected the app, or Vitest did not start.
      const failure = timedOut
        ? `the fixture did not finish in ${fixtureTimeout} minutes`
        : !report
          ? startupError(fs.readFileSync(logFile, "utf8"))
          : !report.finished
            ? "the run of the fixture stopped before its last test"
            : report.errors.length > 0
              ? report.errors
                  .map(({ file, message }) => `${file} did not load: ${message}`)
                  .join("\n")
              : tests.length === 0
                ? "no test ran"
                : undefined;
      end(failure, tests);
    });
  });
}

function readReport(file: string): Report | undefined {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as Report;
  } catch {
    // No run got as far as a test.
    return undefined;
  }
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

// Two tests of a file can have the same name: from a loop, or from `it.each`,
// where Vitest cuts a long value in the name short.
function uniqueIds() {
  const seen = new Map<string, number>();
  return (test: TestRun): TestRun => {
    const count = (seen.get(test.id) ?? 0) + 1;
    seen.set(test.id, count);
    return count === 1 ? test : { ...test, id: `${test.id} #${count}` };
  };
}

async function runAll(list: Fixture[], isSecondRun = false): Promise<Map<Fixture, FixtureRun>> {
  const runs = new Map<Fixture, FixtureRun>();
  const queue = [...list];
  const worker = async () => {
    for (let fixture = queue.shift(); fixture; fixture = queue.shift()) {
      const run = await runFixture(fixture, isSecondRun);
      runs.set(fixture, run);
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
  await Promise.all(Array.from({ length: Math.min(concurrency, list.length) }, worker));
  return runs;
}

// The tests of a fixture that ended otherwise in its second run.
function unstableBetween(first: FixtureRun, second: FixtureRun): FixtureRun["unstable"] {
  const before = new Map(first.tests.map((test) => [test.id, test.state]));
  const now = new Map(second.tests.map((test) => [test.id, test.state]));
  return Array.from(new Set([...before.keys(), ...now.keys()]))
    .filter((id) => before.get(id) !== now.get(id))
    .map((id) => ({ id, before: before.get(id) ?? "not run", now: now.get(id) ?? "not run" }));
}

console.log(
  `next@${nextVersion}, ${selected.length} of ${fixtures.length} fixtures, mode ${options.mode}` +
    (pluginCheckout ? `, the plugin of ${pluginCheckout}` : ""),
);
const partial = Boolean(options.grep);
const results = await runAll(selected);

// A run that is not what the expectations say is run again, once. A test that
// waits just too short on a busy machine, or a run in which Vite found a
// dependency late, must not pass for a change of the plugin. What ends the
// same twice is a result.
const again = partial
  ? []
  : selected.filter(
      (fixture) => compare(expectations, [results.get(fixture)!]).unexpected.length > 0,
    );
if (again.length > 0) {
  console.log(
    `\nNot what expectations.json says, so once more: ${again.map(({ id }) => id).join(", ")}`,
  );
  for (const [fixture, second] of await runAll(again, true)) {
    results.set(fixture, { ...second, unstable: unstableBetween(results.get(fixture)!, second) });
  }
}
const runs = selected.map((fixture) => results.get(fixture)!);

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

if (options.update) {
  const { unexpected } = compare(expectations, runs);
  expectations = updateExpectations(expectations, runs);
  writeExpectations(expectationsFile, expectations);
  if (unexpected.length > 0) {
    console.log(
      ["", "Written to expectations.json:", "", ...unexpected.map(({ text }) => `  ${text}`)].join(
        "\n",
      ),
    );
  }
}
const comparison = compare(expectations, runs, { partial });
console.log(renderSummary(comparison, runs));
if (Object.hasOwn(expectations.reasons, "untriaged")) {
  console.log("\nGive the tests in expectations.json that are `untriaged` a reason.");
} else if (comparison.unexpected.length > 0 && isOfThisPlugin) {
  console.log("\nIf they are right, run again with --update and give the new failures a reason.");
}
console.log(
  `\nThe results are in ${path.relative(process.cwd(), resultsFile)}, ` +
    `the output of each fixture in ${path.relative(process.cwd(), path.join(work, "logs"))}.`,
);

if (options.docs) {
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
