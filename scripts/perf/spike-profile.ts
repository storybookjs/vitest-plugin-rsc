/// <reference types="node" />

// SPIKE SB-2270, not for main: a CPU profile and a trace of the main thread of
// one cold and one third load of a static build, to say where the busy time
// goes: compiling (V8.Compile*, Parse*), evaluating, and the rest.
//
//   node scripts/perf/spike-profile.ts <dist dir> [route] [runs]

import fs from "node:fs";
import { chromium } from "playwright";
import { serveFiles } from "../../playground/test-helpers/serve-files.ts";

const [dir, route = "/", runsArg = "5"] = process.argv.slice(2);
if (!dir) throw new Error("usage: spike-profile.ts <dist dir> [route] [runs]");
const runs = Number(runsArg);
const hashed = /^(assets|_next\/static|vitest-plugin-rsc\/[^/]+\/assets)\//;
const site = await serveFiles(dir, "/", { cache: { hashed } });
const browser = await chromium.launch();
const url = route.startsWith("?")
  ? `${site.url}${route}`
  : `${site.url}?url=${encodeURIComponent(route)}`;

type Totals = Record<string, number>;
const sum = (into: Totals, key: string, value: number) => (into[key] = (into[key] ?? 0) + value);

async function traced(context: import("playwright").BrowserContext): Promise<Totals> {
  const page = await context.newPage();
  await browser.startTracing(page, {
    categories: [
      "devtools.timeline",
      "v8",
      "v8.execute",
      "disabled-by-default-v8.compile",
      "disabled-by-default-devtools.timeline",
      "toplevel",
      "blink",
      "__metadata",
    ],
  });
  await page.goto(url);
  await page.waitForFunction(() => (window as { __hostState?: string }).__hostState);
  const state = await page.evaluate(() => (window as { __hostState?: string }).__hostState);
  if (state !== "ready") throw new Error(`host state ${state}`);
  const trace = JSON.parse(String(await browser.stopTracing()));
  const events: any[] = trace.traceEvents ?? trace;
  await page.close();
  // The renderer's main thread: the one with the most top-level task time.
  const byThread = new Map<string, number>();
  for (const e of events) {
    if (e.ph === "X" && (e.name === "RunTask" || e.name === "ThreadControllerImpl::RunTask")) {
      const key = `${e.pid}:${e.tid}`;
      byThread.set(key, (byThread.get(key) ?? 0) + e.dur);
    }
  }
  // The renderer's main thread is CrRendererMain.
  const names = new Map<string, string>();
  for (const e of events) {
    if (e.ph === "M" && e.name === "thread_name") names.set(`${e.pid}:${e.tid}`, e.args?.name);
  }
  const main = [...byThread]
    .filter(([key]) => names.get(key) === "CrRendererMain")
    .sort((a, b) => b[1] - a[1])[0]?.[0];
  if (process.env.SPIKE_DEBUG) {
    const hist = new Map<string, number>();
    for (const e of events) {
      if (e.ph === "X" && `${e.pid}:${e.tid}` === main) {
        hist.set(e.name, (hist.get(e.name) ?? 0) + (e.dur ?? 0) / 1000);
      }
    }
    console.error(main, byThread.size, [...hist].sort((a, b) => b[1] - a[1]).slice(0, 40));
  }
  const totals: Totals = {};
  for (const e of events) {
    if (e.ph !== "X" || `${e.pid}:${e.tid}` !== main) continue;
    const ms = (e.dur ?? 0) / 1000;
    if (e.name === "RunTask") sum(totals, "task", ms);
    const v8 =
      /^V8\.(CompileCode|ParseFunction|ParseProgram|PreParse|CollectSourcePositions|CompileIgnition|CompileEval)$/;
    if (v8.test(e.name)) sum(totals, e.name, ms);
    const blink =
      /^v8\.(compile|compileModule|produceCache|produceModuleCache|evaluateModule|callFunction|run)$/;
    if (blink.test(e.name)) sum(totals, e.name, ms);
  }
  // Whether a compile used the code cache, on any thread.
  for (const e of events) {
    if (!e.name.startsWith('v8.compile') && !/ache|eserializ|onsume/.test(e.name)) continue;
    const data = e.args?.data ?? {};
    if (data.consumedCacheSize) sum(totals, "consumedCacheKB", data.consumedCacheSize / 1024);
    if (data.cacheRejected) sum(totals, "cacheRejected", 1);
    if (data.producedCacheSize) sum(totals, "producedCacheKB", data.producedCacheSize / 1024);
    if (process.env.SPIKE_DEBUG_CACHE) console.error(e.name, JSON.stringify(e.args).slice(0, 800));
  }
  return totals;
}

const all: Record<string, Totals[]> = { cold: [], warm: [], third: [] };
for (let run = 0; run < runs; run++) {
  const context = await browser.newContext();
  for (const condition of ["cold", "warm", "third"]) all[condition]!.push(await traced(context));
  await context.close();
}
const median = (values: number[]) => {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] ?? 0;
};
const keys = [...new Set(Object.values(all).flatMap((list) => list.flatMap(Object.keys)))].sort();
const out: Record<string, Record<string, number>> = {};
for (const condition of Object.keys(all)) {
  out[condition] = Object.fromEntries(
    keys.map((key) => [key, Math.round(median(all[condition]!.map((t) => t[key] ?? 0)) * 10) / 10]),
  );
}
console.log(JSON.stringify({ dir, route, runs, ...out }, null, 2));
fs.writeFileSync(
  `${dir}/../profile-${route.replace(/\W+/g, "_")}.json`,
  JSON.stringify(out, null, 2),
);
await browser.close();
await site.close();
