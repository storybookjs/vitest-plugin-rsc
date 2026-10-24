import { mergeConfig } from "vitest/config";
import {
  BenchReporter,
  benchCommands,
  benchMode,
  configEvaluated,
  startupMarks,
} from "./bench/reporter.ts";
import config from "./vitest.config.ts";

// vitest.config.ts, with the benchmark of primitives of bench/ instead of the
// tests: startup, a page load, a navigation, a Server Action, an event of
// each kind, a wait, a query and a query of the database, each timed many
// times, in a table at the end and in bench-results/<mode>.json. See
// bench/harness.ts.
configEvaluated();

const merged = mergeConfig(config, {
  plugins: [startupMarks()],
  define: { "import.meta.env.BENCH_MODE": JSON.stringify(benchMode) },
  test: {
    browser: { commands: benchCommands },
    // A primitive runs a hundred times and more.
    testTimeout: 300_000,
  },
});
// Not merged: in place of the tests, the bench, and its marks of startup
// around the setup files (the plugin puts its own before them).
merged.test!.include = ["bench/*.test.tsx"];
merged.test!.setupFiles = [
  "./bench/startup-first.ts",
  "./vitest.setup.ts",
  "./bench/startup-last.ts",
];
merged.test!.reporters = ["tree", new BenchReporter()];

export default merged;
