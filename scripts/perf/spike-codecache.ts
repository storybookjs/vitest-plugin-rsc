/// <reference types="node" />

// SPIKE SB-2270, not for main: does V8's code cache make the later loads of a
// static build faster? Playwright's `newContext()` is an off-the-record
// profile, which may have no code cache. This uses a persistent profile, a
// fresh one per run, and loads the same route five times in it, a new page
// each, measuring ready ms and the main thread's TaskDuration, and how big
// the profile's code cache is afterwards.
//
//   node scripts/perf/spike-codecache.ts <dist dir> [route] [runs] [incognito]

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium, type BrowserContext } from "playwright";
import { serveFiles } from "../../playground/test-helpers/serve-files.ts";

const [dir, route = "/", runsArg = "3", mode = "persistent"] = process.argv.slice(2);
if (!dir) throw new Error("usage: spike-codecache.ts <dist dir> [route] [runs] [incognito]");
const runs = Number(runsArg);
const loadsPerRun = 5;
const hashed = /^(assets|_next\/static|vitest-plugin-rsc\/[^/]+\/assets)\//;
const site = await serveFiles(dir, "/", { cache: { hashed } });
const url = route.startsWith("?")
  ? `${site.url}${route}`
  : `${site.url}?url=${encodeURIComponent(route)}`;

function recordHostState(): void {
  const host = window as { __hostState?: string; __hostStateAt?: number };
  let state: string | undefined;
  Object.defineProperty(host, "__hostState", {
    configurable: true,
    get: () => state,
    set(value: string) {
      state = value;
      host.__hostStateAt = performance.now();
    },
  });
}

async function load(context: BrowserContext) {
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Performance.enable");
  await page.goto(url);
  await page.waitForFunction(() => (window as { __hostState?: string }).__hostState);
  const { state, at } = await page.evaluate(() => ({
    state: (window as { __hostState?: string }).__hostState,
    at: (window as { __hostStateAt?: number }).__hostStateAt!,
  }));
  if (state !== "ready") throw new Error(`host state ${state}`);
  const { metrics } = await cdp.send("Performance.getMetrics");
  const task = metrics.find((m) => m.name === "TaskDuration")!.value * 1000;
  const script = metrics.find((m) => m.name === "ScriptDuration")!.value * 1000;
  await page.close();
  return { ready: at, task, script };
}

const results: { ready: number; task: number; script: number }[][] = [];
const cacheSizes: number[] = [];
for (let run = 0; run < runs; run++) {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "sb2270-profile-"));
  const context =
    mode === "incognito"
      ? await (await chromium.launch()).newContext()
      : await chromium.launchPersistentContext(userDataDir);
  await context.addInitScript(recordHostState);
  const loads = [];
  for (let index = 0; index < loadsPerRun; index++) loads.push(await load(context));
  results.push(loads);
  await context.close();
  const codeCache = path.join(userDataDir, "Default", "Code Cache", "js");
  let bytes = 0;
  if (fs.existsSync(codeCache)) {
    for (const file of fs.readdirSync(codeCache))
      bytes += fs.statSync(path.join(codeCache, file)).size;
  }
  cacheSizes.push(bytes);
  fs.rmSync(userDataDir, { recursive: true, force: true });
}
const median = (values: number[]) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!;
console.log(`${dir} ${route} (${mode}, ${runs} runs): load n: ready ms / busy ms / script ms`);
for (let index = 0; index < loadsPerRun; index++) {
  const of = results.map((loads) => loads[index]!);
  console.log(
    `  load ${index + 1}: ${median(of.map((l) => l.ready)).toFixed(0)} / ${median(of.map((l) => l.task)).toFixed(0)} / ${median(of.map((l) => l.script)).toFixed(0)}`,
  );
}
console.log(`  code cache on disk after: ${(median(cacheSizes) / 1024).toFixed(0)} kB`);
await site.close();
