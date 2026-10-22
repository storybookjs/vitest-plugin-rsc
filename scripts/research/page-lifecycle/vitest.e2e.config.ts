// Throwaway measurement for docs/page-lifecycle-risk.md: the e2e demo's
// project, with the test files of this directory instead of its own.
// Run it with run.sh, which sets the RESEARCH_* variables.
import { fileURLToPath } from "node:url";
import { defineProject, mergeConfig, type ViteUserConfig } from "vitest/config";
import { heapSnapshot } from "./heap-snapshot-command.ts";
import e2e from "../../../playground/nextjs-e2e-demo/vitest.config.ts";

// oxlint-disable-next-line no-process-env
const env = process.env;
const dir = fileURLToPath(new URL(`./${env.RESEARCH_DIR ?? "e2e"}/`, import.meta.url));

export default mergeConfig(
  // An object: the e2e demo's project is not a function.
  e2e as ViteUserConfig,
  defineProject({
    test: {
      name: "page-lifecycle-research",
      dir,
      isolate: env.RESEARCH_ISOLATE === "1",
      // One tab: every file of the run in the same worker, one after another.
      maxWorkers: 1,
      fileParallelism: false,
      browser: { commands: { heapSnapshot } },
      testTimeout: 300_000,
      hookTimeout: 120_000,
      provide: {
        leak: env.RESEARCH_LEAK === "1",
        pages: Number(env.RESEARCH_PAGES ?? 30),
      },
    },
  }),
);
