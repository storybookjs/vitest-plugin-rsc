// Throwaway measurement for docs/page-lifecycle-risk.md: the notes demo's
// project, with the test files of this directory instead of its own.
import { fileURLToPath } from "node:url";
import { defineProject, mergeConfig } from "vitest/config";
import { heapSnapshot } from "./heap-snapshot-command.ts";
import { nextjsNotesProjects } from "../../../playground/nextjs-notes-demo/vitest.config.ts";

// oxlint-disable-next-line no-process-env
const env = process.env;
const dir = fileURLToPath(new URL(`./${env.RESEARCH_DIR ?? "notes"}/`, import.meta.url));

export default mergeConfig(
  nextjsNotesProjects[0]!,
  defineProject({
    test: {
      name: "page-lifecycle-research-notes",
      dir,
      isolate: env.RESEARCH_ISOLATE === "1",
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
