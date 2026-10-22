/// <reference types="node" />

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import zlib from "node:zlib";
import { chromium, type Browser, type BrowserContext } from "playwright";
import type { Site } from "../../playground/test-helpers/serve-files.ts";
import {
  byKindOf,
  hostRequestAfterSsrOf,
  kindOf,
  kinds,
  layerRequestsOf,
  machine,
  profilesOption,
  seeded,
  serveBuild,
  shuffled,
  transferAndChainOf,
  watchNetwork,
  wavesOf,
  type ByKind,
  type Kind,
  type LayerRequests,
  type Profile,
  type RequestRecord,
  type TransferAndChain,
} from "./page-loads.ts";
import {
  ensureDir,
  formatKilobytes,
  gitMetadata,
  list,
  median,
  numberOption,
  repoRoot,
  resolveOutputDir,
  writeJson,
} from "./utils.ts";

// What one page load of the static build of playground/nextjs-e2e-demo costs,
// route by route: the bytes, the requests, the round trips, and the time
// until the host has rendered and the page is styled. Chromatic loads every
// story in a preview iframe of its own, so that is the number to compare
// builds by. A cold load is a new browser context, with nothing in its
// cache. A warm one is the second page of a context, after the first loaded
// the same route. Each loads over each network of `--profiles`, see
// page-loads.ts. The numbers are informational: no threshold fails the run,
// an error of the host does.

type NextBuild = "development" | "production";
const builds: readonly NextBuild[] = ["development", "production"];

const demo = path.join(repoRoot, "playground", "nextjs-e2e-demo");

// Six routes of the build test, one per feature that loads files of its own,
// the node of the host, and the page of the host that opens no page of the
// app, only a file of the host with `"use client"`. A route is a path of the
// app, the query of the host page as it is, after a `?`, or another page of
// the host by its file.
const defaultRoutes = [
  "/",
  "/notes/7",
  "/styles",
  "/fonts",
  "/images",
  "/lazy",
  "?url=/notes/7&node=7",
  "client.html",
];

type Condition = "cold" | "warm";

/** A file of the build: its size as it is, and gzipped. */
type BuiltFile = { bytes: number; gzipBytes: number };

type Load = {
  build: NextBuild;
  route: string;
  profile: Profile;
  condition: Condition;
  iteration: number;
  readyMs: number;
  /** The first frame with text of the page, beyond the host's own status. */
  contentMs: number | undefined;
  /** The first frame with text of the page and every stylesheet of the document loaded. */
  styledMs: number | undefined;
  /** When the host asked for the page of the app: its `host-open` mark. */
  openMs: number | undefined;
  /** How long after `openMs` the page asked for the first script of the route. */
  firstRouteRequestMs: number | undefined;
  /** The first stylesheet the page asked for after `openMs`, which comes with the HTML. */
  cssStartMs: number | undefined;
  /**
   * How long after the first script of the route the page asked for the
   * first stylesheet: what the CSS waits for the scripts. Negative when the
   * stylesheet comes first.
   */
  cssGapMs: number | undefined;
  /** The serial waves of scripts from the first request of the route to the first stylesheet. */
  routeWaves: number | undefined;
  /** The `modules.json` of each layer: its requests, its 304s, and when it ended. */
  layers: LayerRequests;
  /** Until ready: the transfer-bound and the chain-bound part of the load. */
  bound: TransferAndChain;
  /**
   * When `client.html` asked for a file of its own, `host.json`, after the
   * end of the ssr layer's `modules.json`: negative when it did not wait.
   */
  hostRequestAfterSsrMs: number | undefined;
  /** When the last request that ended before the host was ready ended. */
  networkDoneMs: number;
  domContentLoadedMs: number | undefined;
  loadMs: number | undefined;
  firstPaintMs: number | undefined;
  firstContentfulPaintMs: number | undefined;
  /**
   * Chromium's `ScriptDuration` until ready. It counts only the script that a
   * task runs as a script or a callback, not what runs after an `await` of a
   * fetch, which is most of the host and the module runner. So it is far less
   * than the time in script: a CPU profile has that.
   */
  scriptMs: number;
  /** Chromium's time on the main thread in any task, until ready: the time it was busy. */
  taskMs: number;
  /** Chromium's time on the main thread in layout and in style, until ready. */
  layoutMs: number;
  styleMs: number;
  jsHeapUsedBytes: number;
  requests: number;
  serverRequests: number;
  transferBytes: number;
  resourceBytes: number;
  byKind: ByKind;
  errors: string[];
  requestList: RequestRecord[];
};

type BuildInfo = {
  build: NextBuild;
  dir: string;
  buildMs: number | undefined;
  files: number;
  bytes: number;
  gzipBytes: number;
  byKind: Record<Kind, { files: number; bytes: number; gzipBytes: number }>;
  modules: { path: string; bytes: number; gzipBytes: number; brotliBytes: number }[];
};

type Summary = {
  build: NextBuild;
  route: string;
  profile: Profile;
  condition: Condition;
  loads: number;
  readyMs: number | undefined;
  styledMs: number | undefined;
  firstRouteRequestMs: number | undefined;
  cssGapMs: number | undefined;
  routeWaves: number | undefined;
  /** By layer: the requests of its `modules.json`, the 304s among them, and when the last ended. */
  layers: LayerRequests;
  wireMs: number | undefined;
  waves: number | undefined;
  idleMs: number | undefined;
  hostRequestAfterSsrMs: number | undefined;
  networkDoneMs: number | undefined;
  domContentLoadedMs: number | undefined;
  firstContentfulPaintMs: number | undefined;
  scriptMs: number | undefined;
  taskMs: number | undefined;
  layoutMs: number | undefined;
  styleMs: number | undefined;
  requests: number | undefined;
  serverRequests: number | undefined;
  transferBytes: number | undefined;
  resourceBytes: number | undefined;
  transferBytesByKind: Record<Kind, number | undefined>;
};

async function main(): Promise<void> {
  const { values } = parseArgs({
    args: process.argv.slice(2).filter((arg) => arg !== "--"),
    options: {
      builds: { type: "string" },
      iterations: { type: "string" },
      label: { type: "string" },
      "output-dir": { type: "string" },
      profiles: { type: "string" },
      routes: { type: "string" },
      seed: { type: "string" },
      "skip-build": { type: "boolean" },
    },
  });

  const outputDir = resolveOutputDir(values["output-dir"], "static-build");
  const label = values.label ?? process.env.PERF_LABEL ?? "repo";
  const iterations = numberOption(values.iterations ?? process.env.PERF_STATIC_ITERATIONS, 5);
  if (!Number.isInteger(iterations) || iterations < 1) {
    throw new Error(`--iterations is a whole number of 1 or more, not ${iterations}.`);
  }
  const routes = list(values.routes) ?? defaultRoutes;
  const profiles = profilesOption(values.profiles);
  const seed = numberOption(values.seed ?? process.env.PERF_SEED, 1);
  const selected = (list(values.builds) ?? builds).map((build) => {
    if (!builds.includes(build as NextBuild)) {
      throw new Error(`--builds takes ${builds.join(" and ")}, not "${build}".`);
    }
    return build as NextBuild;
  });

  await ensureDir(outputDir);

  const infos: BuildInfo[] = [];
  for (const build of selected) {
    const dir = path.join(outputDir, `dist-${build}`);
    const buildMs = values["skip-build"] ? undefined : runBuild(build, dir, outputDir);
    if (!fs.existsSync(path.join(dir, "index.html"))) {
      throw new Error(`${path.relative(repoRoot, dir)} has no build: run without --skip-build.`);
    }
    infos.push({ build, dir, buildMs, ...measureFiles(dir) });
  }

  const { loads, machine } = await measureLoads(infos, routes, profiles, iterations, seed);

  const summaries = summarize(loads, selected, routes, profiles);
  const results = {
    label,
    createdAt: new Date().toISOString(),
    repo: gitMetadata(repoRoot),
    machine,
    iterations,
    seed,
    profiles,
    routes,
    builds: infos.map(({ dir, ...info }) => ({ ...info, dir: path.relative(repoRoot, dir) })),
    summaries,
    loads,
  };
  await writeJson(path.join(outputDir, "results.json"), results);
  const summaryPath = path.join(outputDir, "summary.md");
  await writeSummary(summaryPath, results, infos, summaries, loads);

  console.log(`\n${await readFile(summaryPath, "utf8")}`);
  console.log(`Wrote static build benchmark artifacts to ${path.relative(repoRoot, outputDir)}`);
}

/** The URL of a route: a page of the host, or its query of the host page, see host/main.tsx. */
function urlOf(site: Site, route: string): string {
  if (/^[^/?]+\.html(\?|$)/.test(route) || route.startsWith("?")) return `${site.url}${route}`;
  return `${site.url}?${new URLSearchParams({ url: route })}`;
}

// `vite build` of the demo, as its `build` script runs it, with the build of
// Next that the config reads from the environment. Its own variable, and not
// stripped as the build test strips Vitest's: this script runs no Vitest.
function runBuild(build: NextBuild, dir: string, outputDir: string): number {
  console.log(
    `Building playground/nextjs-e2e-demo for ${build} into ${path.relative(repoRoot, dir)}`,
  );
  const started = performance.now();
  const result = spawnSync(
    "pnpm",
    ["--dir", demo, "run", "build", "--emptyOutDir", "--outDir", dir, "--logLevel", "warn"],
    {
      cwd: repoRoot,
      env: { ...process.env, VITEST_PLUGIN_RSC_BUILD: build },
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  const buildMs = performance.now() - started;
  fs.writeFileSync(path.join(outputDir, `build-${build}.log`), `${result.stdout}${result.stderr}`);
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `The ${build} build failed with exit code ${result.status}:\n${result.stdout}${result.stderr}`,
    );
  }
  return buildMs;
}

// The files of a build, each with its size and its gzip size: the sizes of the
// table of builds, and the size of each file that a page load asked for.
const filesOfBuild = new Map<string, Map<string, BuiltFile>>();

function measureFiles(dir: string): Omit<BuildInfo, "build" | "dir" | "buildMs"> {
  const files = new Map<string, BuiltFile>();
  const modules: BuildInfo["modules"] = [];
  for (const entry of fs.readdirSync(dir, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const file = path.join(entry.parentPath, entry.name);
    const content = fs.readFileSync(file);
    const relative = path.relative(dir, file).split(path.sep).join("/");
    const size = { bytes: content.byteLength, gzipBytes: zlib.gzipSync(content).byteLength };
    files.set(relative, size);
    if (kindOf(`/${relative}`) === "modules.json") {
      // Brotli too, as a CDN may send it, at its best quality, as for a file
      // that is compressed ahead of time: only for these, most of a build.
      const brotliBytes = zlib.brotliCompressSync(content).byteLength;
      modules.push({ path: relative, ...size, brotliBytes });
    }
  }
  filesOfBuild.set(dir, files);

  const byKind = Object.fromEntries(
    kinds.map((kind) => [kind, { files: 0, bytes: 0, gzipBytes: 0 }]),
  ) as BuildInfo["byKind"];
  let bytes = 0;
  let gzipBytes = 0;
  for (const [file, size] of files) {
    const kind = kindOf(`/${file}`);
    byKind[kind].files += 1;
    byKind[kind].bytes += size.bytes;
    byKind[kind].gzipBytes += size.gzipBytes;
    bytes += size.bytes;
    gzipBytes += size.gzipBytes;
  }
  modules.sort((a, b) => a.path.localeCompare(b.path));
  return { files: files.size, bytes, gzipBytes, byKind, modules };
}

async function measureLoads(
  infos: BuildInfo[],
  routes: string[],
  profiles: Profile[],
  iterations: number,
  seed: number,
): Promise<{ loads: Load[]; machine: Record<string, string | number> }> {
  // The servers of files run in this process, and Playwright closes Chromium
  // when the process is stopped, so nothing outlives the script. An error
  // closes them here, before the script reports it.
  const sites = new Map<NextBuild, Site>();
  let browser: Browser | undefined;
  try {
    for (const info of infos) sites.set(info.build, await serveBuild(info.dir));
    browser = await chromium.launch();
    console.log(
      `Chromium ${browser.version()}, ${iterations} iterations of ${routes.length} routes over ${profiles.join(" and ")}, seed ${seed}`,
    );

    // A cold and a warm load of each route per build that are not measured:
    // the browser starts its processes, and the server compresses the files.
    for (const info of infos) {
      for (const route of routes) {
        await loadInNewContext(browser, sites.get(info.build)!, info, route, "local", 0, () => {});
      }
    }

    const loads: Load[] = [];
    // Iteration by iteration, in an order of the seed, so that a slow minute
    // of the machine is spread over the routes, the builds and the networks,
    // and not on one of them.
    const runs = profiles.flatMap((profile) =>
      infos.flatMap((info) => routes.map((route) => ({ profile, info, route }))),
    );
    const random = seeded(seed);
    for (let iteration = 1; iteration <= iterations; iteration++) {
      for (const { profile, info, route } of shuffled(runs, random)) {
        await loadInNewContext(
          browser,
          sites.get(info.build)!,
          info,
          route,
          profile,
          iteration,
          (load) => loads.push(load),
        );
      }
      console.log(`Iteration ${iteration}/${iterations} done`);
    }
    return { loads, machine: machine(browser) };
  } finally {
    await browser?.close();
    await Promise.all([...sites.values()].map((site) => site.close()));
  }
}

// A cold load in a new context, and then a warm one: a new page of the same
// context, with what the first put in the HTTP cache. The first page is
// closed first, as a preview iframe goes when the next story loads.
async function loadInNewContext(
  browser: Browser,
  site: Site,
  info: BuildInfo,
  route: string,
  profile: Profile,
  iteration: number,
  record: (load: Load) => void,
): Promise<void> {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  try {
    await context.addInitScript(recordHostState);
    for (const condition of ["cold", "warm"] as const) {
      const measured = await measureLoad(context, site, info, route, profile);
      record({ build: info.build, route, profile, condition, iteration, ...measured });
    }
  } finally {
    await context.close();
  }
}

// Runs in the page before its scripts: the time at which the host sets its
// state, from the start of the navigation, and a promise of it. Polling for
// the state would run scripts of Playwright on the page while it loads. And
// the first frame with text of the page, beyond the host's own status line,
// and the first with that and every stylesheet of the document loaded:
// when the page shows, and when it shows styled.
function recordHostState(): void {
  const host = window as {
    __hostState?: string;
    __hostStateAt?: number;
    __hostStateSet?: Promise<void>;
    __contentAt?: number;
    __styledAt?: number;
  };
  const frame = () => {
    const status = document.getElementById("host-status")?.innerText.trim() ?? "";
    const text = document.body?.innerText.trim() ?? "";
    if (text && text !== status) {
      host.__contentAt ??= performance.now();
      const stylesheets = document.querySelectorAll<HTMLLinkElement>('link[rel~="stylesheet"]');
      if (Array.from(stylesheets).every((link) => link.sheet || link.disabled)) {
        host.__styledAt = performance.now();
      }
    }
    if (host.__styledAt === undefined && performance.now() < 120_000) {
      requestAnimationFrame(frame);
    }
  };
  requestAnimationFrame(frame);
  let state: string | undefined;
  let set: () => void;
  host.__hostStateSet = new Promise((resolve) => (set = resolve));
  Object.defineProperty(host, "__hostState", {
    configurable: true,
    get: () => state,
    set(value: string) {
      state = value;
      host.__hostStateAt = performance.now();
      set();
    },
  });
}

async function measureLoad(
  context: BrowserContext,
  site: Site,
  info: BuildInfo,
  route: string,
  profile: Profile,
): Promise<Omit<Load, "build" | "route" | "profile" | "condition" | "iteration">> {
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.stack ?? error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console.error: ${message.text()}`);
  });
  const network = await watchNetwork(context, page, profile);

  try {
    await page.goto(urlOf(site, route), { waitUntil: "commit" });
    const set = await page.evaluate((timeout) => {
      const { __hostStateSet } = window as { __hostStateSet?: Promise<void> };
      return Promise.race([
        __hostStateSet?.then(() => true),
        new Promise<false>((resolve) => setTimeout(() => resolve(false), timeout)),
      ]);
    }, 120_000);
    // Right after ready, for what the main thread did until then.
    const { metrics } = await network.cdp.send("Performance.getMetrics");
    const metric = (name: string) => metrics.find((entry) => entry.name === name)?.value ?? 0;
    if (!set) {
      // The console names no URL for a 404: CDP does.
      const failed: string[] = [];
      await network.requests(site, () => undefined, failed);
      throw new Error(
        `The host of ${route} in the ${info.build} build set no state in 120 s.\n` +
          `Errors of the page:\n${[...errors, ...failed].join("\n") || "(none)"}`,
      );
    }
    const host = await page.evaluate(() => {
      const state = window as {
        __hostState?: string;
        __hostStateAt?: number;
        __hostError?: unknown;
      };
      const error = state.__hostError;
      return {
        state: state.__hostState,
        at: state.__hostStateAt!,
        error: error instanceof Error ? (error.stack ?? error.message) : String(error),
      };
    });
    if (host.state !== "ready") {
      throw new Error(
        `The host of ${route} in the ${info.build} build is "${host.state}": ${host.error}\n` +
          `Errors of the page:\n${errors.join("\n") || "(none)"}`,
      );
    }

    // What the page loads after it is ready, like an image or a font, still
    // counts: Chromatic waits for those before it takes a snapshot.
    const loading = await network.quiet();
    if (loading > 0) errors.push(`${loading} requests still loading after 10 s`);

    const timings = await page.evaluate(() => {
      const [navigation] = performance.getEntriesByType(
        "navigation",
      ) as PerformanceNavigationTiming[];
      const paint = (name: string) =>
        performance.getEntriesByType("paint").find((entry) => entry.name === name)?.startTime;
      const marks = window as { __contentAt?: number; __styledAt?: number };
      return {
        domContentLoadedMs: navigation?.domContentLoadedEventEnd || undefined,
        loadMs: navigation?.loadEventEnd || undefined,
        firstPaintMs: paint("first-paint"),
        firstContentfulPaintMs: paint("first-contentful-paint"),
        contentMs: marks.__contentAt,
        styledMs: marks.__styledAt,
        openMs: performance.getEntriesByName("host-open", "mark")[0]?.startTime,
      };
    });

    const files = filesOfBuild.get(info.dir)!;
    const requestList = await network.requests(site, (file) => files.get(file)?.bytes, errors);
    const sum = (key: "transferBytes" | "resourceBytes") =>
      requestList.reduce((total, request) => total + request[key], 0);
    const endsBeforeReady = requestList
      .map((request) => request.endMs)
      .filter((end): end is number => end !== undefined && end <= host.at);

    return {
      readyMs: host.at,
      networkDoneMs: Math.max(0, ...endsBeforeReady),
      ...timings,
      ...routeChain(requestList, timings.openMs, host.at),
      layers: layerRequestsOf(requestList),
      bound: transferAndChainOf(requestList, host.at, profile),
      hostRequestAfterSsrMs: hostRequestAfterSsrOf(requestList, "/host.json"),
      scriptMs: metric("ScriptDuration") * 1000,
      taskMs: metric("TaskDuration") * 1000,
      layoutMs: metric("LayoutDuration") * 1000,
      styleMs: metric("RecalcStyleDuration") * 1000,
      jsHeapUsedBytes: metric("JSHeapUsedSize"),
      requests: requestList.length,
      serverRequests: requestList.filter(
        (request) => request.source === "network" || request.source === "revalidated",
      ).length,
      transferBytes: sum("transferBytes"),
      resourceBytes: sum("resourceBytes"),
      byKind: byKindOf(requestList),
      errors,
      requestList,
    };
  } finally {
    await page.close();
  }
}

// The round trips of a route, from the host's call that opens it: the
// scripts the page asks for until its first stylesheet, which comes with the
// HTML of the route, in their waves.
function routeChain(
  requests: RequestRecord[],
  openMs: number | undefined,
  readyMs: number,
): Pick<Load, "firstRouteRequestMs" | "cssStartMs" | "cssGapMs" | "routeWaves"> {
  if (openMs === undefined) {
    return {
      firstRouteRequestMs: undefined,
      cssStartMs: undefined,
      cssGapMs: undefined,
      routeWaves: undefined,
    };
  }
  const ofRoute = requests
    .filter((request) => request.startMs >= openMs && request.path.startsWith("/"))
    .sort((a, b) => a.startMs - b.startMs);
  const cssStartMs = ofRoute.find((request) => request.kind === "css")?.startMs;
  const firstScriptMs = ofRoute.find((request) => request.kind === "js")?.startMs;
  const routeWaves = wavesOf(
    ofRoute.filter((request) => request.kind === "js" && request.startMs < (cssStartMs ?? readyMs)),
  );
  return {
    firstRouteRequestMs: firstScriptMs === undefined ? undefined : firstScriptMs - openMs,
    cssStartMs,
    cssGapMs:
      cssStartMs === undefined || firstScriptMs === undefined
        ? undefined
        : cssStartMs - firstScriptMs,
    routeWaves,
  };
}

function summarize(
  loads: Load[],
  selected: NextBuild[],
  routes: string[],
  profiles: Profile[],
): Summary[] {
  const summaries: Summary[] = [];
  for (const build of selected) {
    for (const route of routes) {
      for (const profile of profiles) {
        for (const condition of ["cold", "warm"] as const) {
          const of = loads.filter(
            (load) =>
              load.build === build &&
              load.route === route &&
              load.profile === profile &&
              load.condition === condition,
          );
          const at = (pick: (load: Load) => number | undefined) =>
            median(of.map(pick).filter((value): value is number => value !== undefined));
          const layers: LayerRequests = {};
          for (const layer of new Set(of.flatMap((load) => Object.keys(load.layers)))) {
            layers[layer] = {
              requests: at((load) => load.layers[layer]?.requests ?? 0) ?? 0,
              revalidated: at((load) => load.layers[layer]?.revalidated ?? 0) ?? 0,
              endMs: at((load) => load.layers[layer]?.endMs),
            };
          }
          summaries.push({
            build,
            route,
            profile,
            condition,
            loads: of.length,
            readyMs: at((load) => load.readyMs),
            styledMs: at((load) => load.styledMs),
            firstRouteRequestMs: at((load) => load.firstRouteRequestMs),
            cssGapMs: at((load) => load.cssGapMs),
            routeWaves: at((load) => load.routeWaves),
            layers,
            wireMs: at((load) => load.bound.wireMs),
            waves: at((load) => load.bound.waves),
            idleMs: at((load) => load.bound.idleMs),
            hostRequestAfterSsrMs: at((load) => load.hostRequestAfterSsrMs),
            networkDoneMs: at((load) => load.networkDoneMs),
            domContentLoadedMs: at((load) => load.domContentLoadedMs),
            firstContentfulPaintMs: at((load) => load.firstContentfulPaintMs),
            scriptMs: at((load) => load.scriptMs),
            taskMs: at((load) => load.taskMs),
            layoutMs: at((load) => load.layoutMs),
            styleMs: at((load) => load.styleMs),
            requests: at((load) => load.requests),
            serverRequests: at((load) => load.serverRequests),
            transferBytes: at((load) => load.transferBytes),
            resourceBytes: at((load) => load.resourceBytes),
            transferBytesByKind: Object.fromEntries(
              kinds.map((kind) => [kind, at((load) => load.byKind[kind].transferBytes)]),
            ) as Summary["transferBytesByKind"],
          });
        }
      }
    }
  }
  return summaries;
}

const formatMs = (value: number | undefined) =>
  value === undefined ? "n/a" : `${Math.round(value)}`;
const count = (value: number | undefined) => (value === undefined ? "n/a" : `${Math.round(value)}`);

async function writeSummary(
  summaryPath: string,
  results: {
    label: string;
    createdAt: string;
    repo: Record<string, string>;
    machine: Record<string, string | number>;
    iterations: number;
    seed: number;
  },
  infos: BuildInfo[],
  summaries: Summary[],
  loads: Load[],
): Promise<void> {
  const lines = [
    `# Static Build Page Load Summary`,
    ``,
    `Label: ${results.label}`,
    `Created: ${results.createdAt}`,
    `Commit: ${results.repo.sha} (${results.repo.branch})`,
    `Machine: ${Object.entries(results.machine)
      .map(([name, value]) => `${name} ${value}`)
      .join(", ")}`,
    ``,
    `The medians of ${results.iterations} page loads of the host of playground/nextjs-e2e-demo, per build, route, network and cache, in an order of seed ${results.seed}. These numbers are informational. The run fails on an error of the host, not on a number.`,
    ``,
    `- cold: a new browser context. warm: a second page of the context, after the first loaded the route.`,
    `- local: localhost as it is, where a request costs next to nothing, so the times are about the CPU. cable: 50 Mbit/s down, 10 up and 20 ms per request, as CDP emulates it, where the round trips show.`,
    `- The server of files serves the build as docs/static-build.md has a static host serve it: brotli, the files under assets/, _next/static/ and vitest-plugin-rsc/*/assets/ immutable, every other file with an ETag and \`no-cache\`, so a warm load asks for it again and gets a 304. "sent" is what came over the wire, headers included.`,
    `- requests: all of the page, with the ones that reached the server in brackets. "sent" and requests count what the page loads after it is ready too, until the network is quiet: Chromatic waits for its images and fonts. In production that is also Next's prefetch of the links on the page.`,
    `- ready ms: from the start of the navigation to the host's \`__hostState === "ready"\`. styled ms: the first frame with text of the page and every stylesheet of the document loaded. network ms: the last request that ended before ready. busy ms: the time the main thread was busy until ready, Chromium's \`TaskDuration\`. results.json also has its \`ScriptDuration\`, which leaves out the script that runs after an \`await\` of a fetch, most of the host: a CPU profile shows what the time is spent on.`,
    ``,
    `## Builds`,
    ``,
    `| build | built in | files | size | gzip | modules.json | gzip | brotli |`,
    `| --- | --: | --: | --: | --: | --: | --: | --: |`,
  ];
  for (const info of infos) {
    const modules = info.modules.reduce(
      (total, file) => ({
        bytes: total.bytes + file.bytes,
        gzipBytes: total.gzipBytes + file.gzipBytes,
        brotliBytes: total.brotliBytes + file.brotliBytes,
      }),
      { bytes: 0, gzipBytes: 0, brotliBytes: 0 },
    );
    lines.push(
      `| ${info.build} | ${info.buildMs === undefined ? "n/a" : `${(info.buildMs / 1000).toFixed(1)} s`} | ${info.files} | ${formatKilobytes(info.bytes)} | ${formatKilobytes(info.gzipBytes)} | ${formatKilobytes(modules.bytes)} | ${formatKilobytes(modules.gzipBytes)} | ${formatKilobytes(modules.brotliBytes)} |`,
    );
  }
  lines.push(``, `The layers, one file each:`, ``);
  for (const info of infos) {
    for (const file of info.modules) {
      lines.push(
        `- ${info.build} \`${file.path}\`: ${formatKilobytes(file.bytes)}, gzip ${formatKilobytes(file.gzipBytes)}, brotli ${formatKilobytes(file.brotliBytes)}`,
      );
    }
  }

  lines.push(
    ``,
    `## Page Loads`,
    ``,
    `| route | build | network | cache | sent | requests | ready ms | styled ms | network ms | busy ms |`,
    `| --- | --- | --- | --- | --: | --: | --: | --: | --: | --: |`,
  );
  const routes = [...new Set(summaries.map((summary) => summary.route))];
  for (const route of routes) {
    for (const summary of summaries.filter((summary) => summary.route === route)) {
      lines.push(
        `| \`${route}\` | ${summary.build} | ${summary.profile} | ${summary.condition} | ${formatKilobytes(summary.transferBytes)} | ${count(summary.requests)} (${count(summary.serverRequests)}) | ${formatMs(summary.readyMs)} | ${formatMs(summary.styledMs)} | ${formatMs(summary.networkDoneMs)} | ${formatMs(summary.taskMs)} |`,
      );
    }
  }

  // The layers of the build, by name, as the loads requested them.
  const layers = [...new Set(summaries.flatMap((summary) => Object.keys(summary.layers)))].sort();
  lines.push(
    ``,
    `## Round Trips`,
    ``,
    `- route request ms: how long after the host asked for the page (its \`host-open\` mark) the page asked for the first script of the route.`,
    `- CSS wait ms: from then until the page asked for its first stylesheet, which comes with the HTML of the route; negative when the stylesheet comes first.`,
    `- route waves: the serial waves of scripts in between. A request that starts after one of its wave has ended may have waited for it, and starts the next. A route without CSS counts them until ready.`,
    `- modules.json: the requests of each layer's file, with the 304s among them in brackets, and when the last ended, in ms from the start of the navigation. host.json after ssr: when \`client.html\` asked for a file of its own, after the ssr layer's file ended; negative when it did not wait for it.`,
    `- Until ready, what the load waited for, in two parts. wire ms, transfer-bound: the bytes on the wire at the download rate of the network, none on localhost. Chain-bound: the serial waves of its requests to the server (load waves; one the cache answers costs no round trip), and idle ms, the time between them in which no request was in flight.`,
    `- The server of files speaks HTTP/1.1, so Chromium sends at most six requests to it at once, where a host with HTTP/2 takes them all.`,
    ``,
    `| route | build | network | cache | wire ms | load waves | idle ms | route request ms | CSS wait ms | route waves | host.json after ssr ms | ${layers.map((layer) => `${layer} modules.json | ends ms`).join(" | ")} |`,
    `| --- | --- | --- | --- | --: | --: | --: | --: | --: | --: | --: | ${layers.map(() => "--: | --:").join(" | ")} |`,
  );
  for (const route of routes) {
    for (const summary of summaries.filter((summary) => summary.route === route)) {
      const ofLayers = layers.map((layer) => {
        const of = summary.layers[layer];
        return of
          ? `${count(of.requests)} (${count(of.revalidated)}) | ${formatMs(of.endMs)}`
          : "0 | n/a";
      });
      lines.push(
        `| \`${route}\` | ${summary.build} | ${summary.profile} | ${summary.condition} | ${formatMs(summary.wireMs)} | ${count(summary.waves)} | ${formatMs(summary.idleMs)} | ${formatMs(summary.firstRouteRequestMs)} | ${formatMs(summary.cssGapMs)} | ${count(summary.routeWaves)} | ${formatMs(summary.hostRequestAfterSsrMs)} | ${ofLayers.join(" | ")} |`,
      );
    }
  }

  const shown = kinds.filter((kind) =>
    summaries.some((summary) => (summary.transferBytesByKind[kind] ?? 0) > 0),
  );
  // The same bytes over every network: the first's.
  const [profile] = new Set(summaries.map((summary) => summary.profile));
  lines.push(
    ``,
    `## What A Cold Load Sends, By Kind`,
    ``,
    `| route | build | ${shown.join(" | ")} |`,
    `| --- | --- | ${shown.map(() => "--:").join(" | ")} |`,
  );
  for (const summary of summaries.filter(
    (summary) => summary.condition === "cold" && summary.profile === profile,
  )) {
    lines.push(
      `| \`${summary.route}\` | ${summary.build} | ${shown.map((kind) => formatKilobytes(summary.transferBytesByKind[kind])).join(" | ")} |`,
    );
  }

  const withErrors = loads.filter((load) => load.errors.length > 0);
  if (withErrors.length > 0) {
    lines.push(``, `## Errors Of The Pages`, ``);
    for (const load of withErrors) {
      lines.push(
        `- ${load.build} ${load.profile} ${load.condition} \`${load.route}\` #${load.iteration}: ${load.errors.map((error) => error.split("\n")[0]).join("; ")}`,
      );
    }
  }

  await writeFile(summaryPath, `${lines.join("\n")}\n`);
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
