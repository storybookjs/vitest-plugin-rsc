// Says which test files watch mode runs again for a file that changes: it
// starts Vitest in watch mode, edits each file in turn and puts it back.
//
//   NODE_OPTIONS='--conditions=vitest-plugin-rsc-source' node scripts/watch-probe.mjs \
//     nextjs-e2e-demo playground/nextjs-e2e-demo/app/notice/page.tsx
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { startVitest } from "vitest/node";

const [project, ...touch] = process.argv.slice(2);
const runs = [];
let done;
const reporter = {
  onTestRunStart(specs) {
    runs.push(specs.map((s) => path.relative(process.cwd(), s.moduleId)).sort());
  },
  onTestRunEnd() {
    done?.();
  },
};
const finished = () => new Promise((resolve) => (done = resolve));
const first = finished();
const vitest = await startVitest("test", [], {
  watch: true,
  project: [project],
  reporters: [reporter],
  configLoader: process.env.NODE_OPTIONS?.includes("vitest-plugin-rsc-source")
    ? "native"
    : "runner",
});
await first;
console.log("FIRST RUN", runs[0].length, "files");
for (const file of touch) {
  const before = runs.length;
  const original = readFileSync(file, "utf8");
  const next = Promise.race([finished(), new Promise((r) => setTimeout(r, 20000))]);
  writeFileSync(file, original + "\n// touched\n");
  await next;
  writeFileSync(file, original);
  // the restore triggers another run
  await Promise.race([finished(), new Promise((r) => setTimeout(r, 20000))]);
  const reran = runs.slice(before);
  console.log("TOUCH", file, "->", JSON.stringify(reran[0] ?? "NOTHING"));
}
await vitest.close();
process.exit(0);
