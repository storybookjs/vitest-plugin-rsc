/// <reference types="node" />

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import zlib from "node:zlib";
import { chromium, type Browser, type BrowserContext, type CDPSession } from "playwright";
import { serveFiles, type Site } from "../../playground/test-helpers/serve-files.ts";
import {
  ensureDir,
  formatKilobytes,
  gitMetadata,
  median,
  numberOption,
  repoRoot,
  resolveOutputDir,
  writeJson,
} from "./utils.ts";

// What one page load of the static build of playground/nextjs-e2e-demo costs,
// route by route: the bytes, the requests, and the time until the host has
// rendered. Chromatic loads every story in a preview iframe of its own, so
// that is the number to compare builds by. A cold load is a new browser
// context, with nothing in its cache. A warm one is the second page of a
// context, after the first loaded the same route. The numbers are
// informational: no threshold fails the run, an error of the host does.

type NextBuild = "development" | "production";
const builds: readonly NextBuild[] = ["development", "production"];

const demo = path.join(repoRoot, "playground", "nextjs-e2e-demo");

// Six routes of the build test, one per feature that loads files of its own,
// and the node of the host. A route is a path of the app, or the query of the
// host page as it is, after a `?`.
const defaultRoutes = [
  "/",
  "/notes/7",
  "/styles",
  "/fonts",
  "/images",
  "/lazy",
  "?url=/notes/7&node=7",
];

// What Vite and Next name with a hash of the content: a static host can let
// the browser keep them. See `cache` of serveFiles.
// SPIKE SB-2270: also the hashed chunks of a layer, vitest-plugin-rsc/<layer>/assets/.
const hashed = /^(assets|_next\/static|vitest-plugin-rsc\/[^/]+\/assets)\//;

// SPIKE SB-2270: a third load in the same context ("third"), to see whether
// V8's code cache, which Chromium fills on the second run of a script, makes
// it faster.
type Condition = "cold" | "warm" | "third";
const conditions = ["cold", "warm", "third"] as const;
type Kind = "modules.json" | "html" | "js" | "css" | "fonts" | "images" | "json" | "other";
const kinds: readonly Kind[] = [
  "modules.json",
  "js",
  "css",
  "fonts",
  "images",
  "html",
  "json",
  "other",
];

/** A file of the build: its size as it is, and gzipped as a host would send it. */
type BuiltFile = { bytes: number; gzipBytes: number };

/** How the browser got a file: over the network, as a 304, or from its cache. */
type Source = "network" | "revalidated" | "disk-cache" | "memory-cache";

type RequestRecord = {
  path: string;
  kind: Kind;
  status: number;
  source: Source;
  /** What came over the wire, headers included: CDP's `encodedDataLength`. */
  transferBytes: number;
  /** The size of the file in the build, whether or not it came over the wire. */
  resourceBytes: number;
  /** The gzip size of the file, if it came over the wire with its body. */
  gzipBytes: number;
  startMs: number;
  endMs: number | undefined;
};

type Load = {
  build: NextBuild;
  route: string;
  condition: Condition;
  iteration: number;
  readyMs: number;
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
  gzipBytes: number;
  byKind: Record<Kind, { requests: number; transferBytes: number; resourceBytes: number }>;
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
  condition: Condition;
  loads: number;
  readyMs: number | undefined;
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
  gzipBytes: number | undefined;
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
      routes: { type: "string" },
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

  const { loads, chromium } = await measureLoads(infos, routes, iterations);

  const summaries = summarize(loads, selected, routes);
  const results = {
    label,
    createdAt: new Date().toISOString(),
    repo: gitMetadata(repoRoot),
    machine: { ...machine(), chromium },
    iterations,
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

function list(value: string | undefined): string[] | undefined {
  const items = value
    ?.split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return items?.length ? items : undefined;
}

/** The query of the host page for a route: see host/main.tsx. */
function hostQuery(route: string): string {
  return route.startsWith("?") ? route : `?${new URLSearchParams({ url: route })}`;
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

// The files of a build, each with its size and its gzip size. The server of
// files sends them as they are, so the gzip size of a page load is computed
// from these, for the files that came over the wire.
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

function kindOf(pathname: string): Kind {
  if (pathname.endsWith("/modules.json")) return "modules.json";
  const extension = path.posix.extname(pathname);
  if (extension === ".html" || pathname.endsWith("/")) return "html";
  if (extension === ".js" || extension === ".mjs") return "js";
  if (extension === ".css") return "css";
  if ([".woff2", ".woff", ".ttf", ".otf"].includes(extension)) return "fonts";
  if ([".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".avif", ".ico"].includes(extension)) {
    return "images";
  }
  if (extension === ".json") return "json";
  return "other";
}

async function measureLoads(
  infos: BuildInfo[],
  routes: string[],
  iterations: number,
): Promise<{ loads: Load[]; chromium: string }> {
  // The servers of files run in this process, and Playwright closes Chromium
  // when the process is stopped, so nothing outlives the script. An error
  // closes them here, before the script reports it.
  const sites = new Map<NextBuild, Site>();
  let browser: Browser | undefined;
  try {
    for (const info of infos) {
      sites.set(info.build, await serveFiles(info.dir, "/", { cache: { hashed } }));
    }
    browser = await chromium.launch();
    console.log(
      `Chromium ${browser.version()}, ${iterations} iterations of ${routes.length} routes`,
    );

    // A cold and a warm load of `/` per build that are not measured: the
    // browser starts its processes.
    for (const info of infos) {
      await loadInNewContext(browser, sites.get(info.build)!, info, "/", 0, () => {});
    }

    const loads: Load[] = [];
    // Iteration by iteration, so that a slow minute of the machine is spread
    // over the routes and the builds, and not on one of them. The builds take
    // turns at going first.
    for (let iteration = 1; iteration <= iterations; iteration++) {
      const order = iteration % 2 === 1 ? infos : [...infos].reverse();
      for (const route of routes) {
        for (const info of order) {
          await loadInNewContext(browser, sites.get(info.build)!, info, route, iteration, (load) =>
            loads.push(load),
          );
        }
      }
      console.log(`Iteration ${iteration}/${iterations} done`);
    }
    return { loads, chromium: browser.version() };
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
  iteration: number,
  record: (load: Load) => void,
): Promise<void> {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  try {
    await context.addInitScript(recordHostState);
    for (const condition of conditions) {
      const measured = await measureLoad(context, site, info, route);
      record({ build: info.build, route, condition, iteration, ...measured });
    }
  } finally {
    await context.close();
  }
}

// Runs in the page before its scripts: the time at which the host sets its
// state, from the start of the navigation, and a promise of it. Polling for
// the state would run scripts of Playwright on the page while it loads.
function recordHostState(): void {
  const host = window as {
    __hostState?: string;
    __hostStateAt?: number;
    __hostStateSet?: Promise<void>;
  };
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

type CdpRequest = {
  url: string;
  start: number;
  status?: number;
  sentStatus?: number;
  fromDiskCache?: boolean;
  fromMemoryCache?: boolean;
  end?: number;
  transferBytes: number;
  failed?: string;
};

async function measureLoad(
  context: BrowserContext,
  site: Site,
  info: BuildInfo,
  route: string,
): Promise<Omit<Load, "build" | "route" | "condition" | "iteration">> {
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.stack ?? error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console.error: ${message.text()}`);
  });

  // CDP's Network domain, and not Playwright's `response` event: it says what
  // came over the wire and what came from the cache, without reading bodies.
  const cdp: CDPSession = await context.newCDPSession(page);
  const requests = new Map<string, CdpRequest>();
  let inFlight = 0;
  let lastActivity = performance.now();
  const settle = () => {
    inFlight -= 1;
    lastActivity = performance.now();
  };
  cdp.on("Network.requestWillBeSent", (event) => {
    if (!event.request.url.startsWith("http")) return;
    // A redirect sends the request again under its id.
    if (!requests.has(event.requestId)) inFlight += 1;
    requests.set(event.requestId, {
      url: event.request.url,
      start: event.timestamp,
      transferBytes: 0,
    });
    lastActivity = performance.now();
  });
  cdp.on("Network.requestServedFromCache", (event) => {
    const request = requests.get(event.requestId);
    if (request) request.fromMemoryCache = true;
  });
  cdp.on("Network.responseReceived", (event) => {
    const request = requests.get(event.requestId);
    if (!request) return;
    request.status = event.response.status;
    request.fromDiskCache = event.response.fromDiskCache;
  });
  // The response gives the status of the copy in the cache, a 200, for one
  // that the server answered with a 304. The status the server sent is here,
  // which can come before the response.
  const sentStatuses = new Map<string, number>();
  cdp.on("Network.responseReceivedExtraInfo", (event) =>
    sentStatuses.set(event.requestId, event.statusCode),
  );
  cdp.on("Network.loadingFinished", (event) => {
    const request = requests.get(event.requestId);
    if (!request || request.end !== undefined) return;
    request.end = event.timestamp;
    request.transferBytes = event.encodedDataLength;
    settle();
  });
  cdp.on("Network.loadingFailed", (event) => {
    const request = requests.get(event.requestId);
    if (!request || request.end !== undefined) return;
    request.end = event.timestamp;
    request.failed = event.errorText;
    settle();
  });
  await cdp.send("Network.enable");
  await cdp.send("Performance.enable");

  try {
    const url = `${site.url}${hostQuery(route)}`;
    await page.goto(url, { waitUntil: "commit" });
    const set = await page.evaluate((timeout) => {
      const { __hostStateSet } = window as { __hostStateSet?: Promise<void> };
      return Promise.race([
        __hostStateSet?.then(() => true),
        new Promise<false>((resolve) => setTimeout(() => resolve(false), timeout)),
      ]);
    }, 120_000);
    // Right after ready, for what the main thread did until then.
    const { metrics } = await cdp.send("Performance.getMetrics");
    const metric = (name: string) => metrics.find((entry) => entry.name === name)?.value ?? 0;
    if (!set) {
      // The console names no URL for a 404: CDP does.
      const failed = [...requests.values()]
        .filter((request) => request.failed || (request.status ?? 0) >= 400)
        .map((request) => `${request.status ?? request.failed}: ${request.url}`);
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
    const quietSince = performance.now();
    while (
      (inFlight > 0 || performance.now() - lastActivity < 500) &&
      performance.now() - quietSince < 10_000
    ) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    if (inFlight > 0) errors.push(`${inFlight} requests still loading after 10 s`);

    const timings = await page.evaluate(() => {
      const [navigation] = performance.getEntriesByType(
        "navigation",
      ) as PerformanceNavigationTiming[];
      const paint = (name: string) =>
        performance.getEntriesByType("paint").find((entry) => entry.name === name)?.startTime;
      return {
        domContentLoadedMs: navigation?.domContentLoadedEventEnd || undefined,
        loadMs: navigation?.loadEventEnd || undefined,
        firstPaintMs: paint("first-paint"),
        firstContentfulPaintMs: paint("first-contentful-paint"),
      };
    });

    // The page counts from the start of the navigation, CDP from a start of
    // its own: CDP has the start of the navigation on its clock.
    const all = [...requests.values()];
    const navigationStart =
      metric("NavigationStart") || Math.min(...all.map((request) => request.start));
    for (const [id, request] of requests) request.sentStatus = sentStatuses.get(id);
    const ms = (timestamp: number) => (timestamp - navigationStart) * 1000;
    const files = filesOfBuild.get(info.dir)!;
    const origin = new URL(site.url).origin;
    const requestList = all.map((request): RequestRecord => {
      const parsed = new URL(request.url);
      const sameOrigin = parsed.origin === origin;
      const { pathname } = parsed;
      const file = sameOrigin
        ? files.get(
            decodeURIComponent(pathname.endsWith("/") ? `${pathname}index.html` : pathname).slice(
              1,
            ),
          )
        : undefined;
      const source: Source = request.fromMemoryCache
        ? "memory-cache"
        : request.fromDiskCache
          ? "disk-cache"
          : request.sentStatus === 304
            ? "revalidated"
            : "network";
      if (request.failed) errors.push(`requestfailed: ${request.url} ${request.failed}`);
      else if ((request.status ?? 0) >= 400) errors.push(`${request.status}: ${request.url}`);
      return {
        // With its query: Next's development code gives the URL of a
        // stylesheet the time of the request, so the cache never has it.
        path: sameOrigin ? `${pathname}${parsed.search}` : request.url,
        kind: sameOrigin ? kindOf(pathname) : "other",
        status: request.sentStatus ?? request.status ?? 0,
        source,
        transferBytes: request.transferBytes,
        resourceBytes: file?.bytes ?? 0,
        gzipBytes: source === "network" ? (file?.gzipBytes ?? 0) : 0,
        startMs: ms(request.start),
        endMs: request.end === undefined ? undefined : ms(request.end),
      };
    });

    const byKind = Object.fromEntries(
      kinds.map((kind) => [kind, { requests: 0, transferBytes: 0, resourceBytes: 0 }]),
    ) as Load["byKind"];
    for (const request of requestList) {
      byKind[request.kind].requests += 1;
      byKind[request.kind].transferBytes += request.transferBytes;
      byKind[request.kind].resourceBytes += request.resourceBytes;
    }
    const sum = (key: "transferBytes" | "resourceBytes" | "gzipBytes") =>
      requestList.reduce((total, request) => total + request[key], 0);
    const endsBeforeReady = requestList
      .map((request) => request.endMs)
      .filter((end): end is number => end !== undefined && end <= host.at);

    return {
      readyMs: host.at,
      networkDoneMs: Math.max(0, ...endsBeforeReady),
      ...timings,
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
      gzipBytes: sum("gzipBytes"),
      byKind,
      errors,
      requestList,
    };
  } finally {
    await page.close();
  }
}

function summarize(loads: Load[], selected: NextBuild[], routes: string[]): Summary[] {
  const summaries: Summary[] = [];
  for (const build of selected) {
    for (const route of routes) {
      for (const condition of conditions) {
        const of = loads.filter(
          (load) => load.build === build && load.route === route && load.condition === condition,
        );
        const at = (pick: (load: Load) => number | undefined) =>
          median(of.map(pick).filter((value): value is number => value !== undefined));
        summaries.push({
          build,
          route,
          condition,
          loads: of.length,
          readyMs: at((load) => load.readyMs),
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
          gzipBytes: at((load) => load.gzipBytes),
          transferBytesByKind: Object.fromEntries(
            kinds.map((kind) => [kind, at((load) => load.byKind[kind].transferBytes)]),
          ) as Summary["transferBytesByKind"],
        });
      }
    }
  }
  return summaries;
}

function machine(): Record<string, string | number> {
  const cpus = os.cpus();
  return {
    platform: `${os.platform()} ${os.release()} ${os.arch()}`,
    cpu: cpus[0]?.model ?? "unknown",
    cores: cpus.length,
    memoryGb: Math.round(os.totalmem() / 1024 ** 3),
    node: process.version,
  };
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
    `The medians of ${results.iterations} page loads of the host of playground/nextjs-e2e-demo, per build, route and cache. These numbers are informational. The run fails on an error of the host, not on a number.`,
    ``,
    `- cold: a new browser context. warm: a second page of the context, after the first loaded the route.`,
    `- The server of files sends the files uncompressed, so "sent" is what came over the wire as it is, headers included. "gzip" is what the same files would be gzipped, computed with node:zlib.`,
    `- The files under assets/ and _next/static/ are immutable for the browser. Every other file has an ETag and \`no-cache\`, so a warm load asks for it again and gets a 304.`,
    `- requests: all of the page, with the ones that reached the server in brackets. "sent" and requests count what the page loads after it is ready too, until the network is quiet: Chromatic waits for its images and fonts. In production that is also Next's prefetch of the links on the page.`,
    `- ready ms: from the start of the navigation to the host's \`__hostState === "ready"\`. network ms: the last request that ended before then. busy ms: the time the main thread was busy until then, Chromium's \`TaskDuration\`. results.json also has its \`ScriptDuration\`, which leaves out the script that runs after an \`await\` of a fetch, most of the host: a CPU profile shows what the time is spent on.`,
    `- The server is on localhost: a request costs next to nothing, so the times are about the CPU, and bytes and requests are what a network would add to them.`,
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
    `| route | build | cache | sent | gzip | requests | ready ms | network ms | busy ms |`,
    `| --- | --- | --- | --: | --: | --: | --: | --: | --: |`,
  );
  const routes = [...new Set(summaries.map((summary) => summary.route))];
  for (const route of routes) {
    for (const summary of summaries.filter((summary) => summary.route === route)) {
      lines.push(
        `| \`${route}\` | ${summary.build} | ${summary.condition} | ${formatKilobytes(summary.transferBytes)} | ${formatKilobytes(summary.gzipBytes)} | ${count(summary.requests)} (${count(summary.serverRequests)}) | ${formatMs(summary.readyMs)} | ${formatMs(summary.networkDoneMs)} | ${formatMs(summary.taskMs)} |`,
      );
    }
  }

  const shown = kinds.filter((kind) =>
    summaries.some((summary) => (summary.transferBytesByKind[kind] ?? 0) > 0),
  );
  lines.push(
    ``,
    `## What A Cold Load Sends, By Kind`,
    ``,
    `| route | build | ${shown.join(" | ")} |`,
    `| --- | --- | ${shown.map(() => "--:").join(" | ")} |`,
  );
  for (const summary of summaries.filter((summary) => summary.condition === "cold")) {
    lines.push(
      `| \`${summary.route}\` | ${summary.build} | ${shown.map((kind) => formatKilobytes(summary.transferBytesByKind[kind])).join(" | ")} |`,
    );
  }

  const withErrors = loads.filter((load) => load.errors.length > 0);
  if (withErrors.length > 0) {
    lines.push(``, `## Errors Of The Pages`, ``);
    for (const load of withErrors) {
      lines.push(
        `- ${load.build} ${load.condition} \`${load.route}\` #${load.iteration}: ${load.errors.map((error) => error.split("\n")[0]).join("; ")}`,
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
