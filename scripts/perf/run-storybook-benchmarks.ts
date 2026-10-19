/// <reference types="node" />

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { chromium, type Browser, type BrowserContext } from "playwright";
import type { Site } from "../../playground/test-helpers/serve-files.ts";
import {
  byKindOf,
  hostRequestAfterSsrOf,
  kinds,
  layerRequestsOf,
  machine,
  profilesOption,
  seeded,
  serveBuild,
  shuffled,
  transferAndChainOf,
  watchNetwork,
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

// What one story costs in a tab of its own, in `storybook build` of
// playground/nextjs-notes-demo: the bytes, the requests, and the time until
// it shows styled and until its play function is done. Chromatic loads every
// story in a preview iframe of its own. A cold load is a new browser context,
// with nothing in its cache. A warm one is the second page of a context,
// after the first loaded the same story. Each loads over each network of
// `--profiles`, see page-loads.ts. The numbers are informational: no
// threshold fails the run, a story that does not finish does.

const demo = path.join(repoRoot, "playground", "nextjs-notes-demo");

// A story of a file with `"use client"`, a story of a page of the app, and
// the docs page of the first, which renders its stories inline.
const defaultStories = ["ui-button--pressed", "pages-notes--with-notes", "ui-button--docs"];

type Condition = "cold" | "warm";

type Load = {
  story: string;
  profile: Profile;
  condition: Condition;
  iteration: number;
  /** The first frame with text of the story, and not Storybook's "preparing". */
  contentMs: number | undefined;
  /** The first frame with that text and every stylesheet of the document loaded. */
  styledMs: number | undefined;
  /** When the render ended, with its play function: for a docs page, when it shows its content. */
  doneMs: number;
  domContentLoadedMs: number | undefined;
  firstContentfulPaintMs: number | undefined;
  /** Chromium's time on the main thread in any task, until done. */
  taskMs: number;
  /** The `modules.json` of each layer: its requests, its 304s, and when it ended. */
  layers: LayerRequests;
  /** Until done: the transfer-bound and the chain-bound part of the load. */
  bound: TransferAndChain;
  /**
   * When Storybook asked for its index, `index.json`, after the end of the ssr
   * layer's `modules.json`: negative when it did not wait.
   */
  indexAfterSsrMs: number | undefined;
  requests: number;
  serverRequests: number;
  transferBytes: number;
  resourceBytes: number;
  byKind: ByKind;
  errors: string[];
  requestList: RequestRecord[];
};

type Summary = {
  story: string;
  profile: Profile;
  condition: Condition;
  loads: number;
  styledMs: number | undefined;
  doneMs: number | undefined;
  taskMs: number | undefined;
  layers: LayerRequests;
  wireMs: number | undefined;
  waves: number | undefined;
  idleMs: number | undefined;
  indexAfterSsrMs: number | undefined;
  requests: number | undefined;
  serverRequests: number | undefined;
  transferBytes: number | undefined;
  transferBytesByKind: Record<Kind, number | undefined>;
};

async function main(): Promise<void> {
  const { values } = parseArgs({
    args: process.argv.slice(2).filter((arg) => arg !== "--"),
    options: {
      iterations: { type: "string" },
      label: { type: "string" },
      "output-dir": { type: "string" },
      profiles: { type: "string" },
      seed: { type: "string" },
      "skip-build": { type: "boolean" },
      stories: { type: "string" },
    },
  });

  const outputDir = resolveOutputDir(values["output-dir"], "storybook");
  const label = values.label ?? process.env.PERF_LABEL ?? "repo";
  const iterations = numberOption(values.iterations ?? process.env.PERF_STORYBOOK_ITERATIONS, 5);
  if (!Number.isInteger(iterations) || iterations < 1) {
    throw new Error(`--iterations is a whole number of 1 or more, not ${iterations}.`);
  }
  const stories = list(values.stories) ?? defaultStories;
  const profiles = profilesOption(values.profiles);
  const seed = numberOption(values.seed ?? process.env.PERF_SEED, 1);

  await ensureDir(outputDir);
  const dir = path.join(outputDir, "storybook-static");
  const buildMs = values["skip-build"] ? undefined : runBuild(dir, outputDir);
  if (!fs.existsSync(path.join(dir, "iframe.html"))) {
    throw new Error(`${path.relative(repoRoot, dir)} has no build: run without --skip-build.`);
  }

  const { loads, machine } = await measureLoads(dir, stories, profiles, iterations, seed);
  const summaries = summarize(loads, stories, profiles);
  const results = {
    label,
    createdAt: new Date().toISOString(),
    repo: gitMetadata(repoRoot),
    machine,
    iterations,
    seed,
    profiles,
    stories,
    build: { dir: path.relative(repoRoot, dir), buildMs },
    summaries,
    loads,
  };
  await writeJson(path.join(outputDir, "results.json"), results);
  const summaryPath = path.join(outputDir, "summary.md");
  await writeSummary(summaryPath, results, summaries, loads);

  console.log(`\n${await readFile(summaryPath, "utf8")}`);
  console.log(`Wrote Storybook benchmark artifacts to ${path.relative(repoRoot, outputDir)}`);
}

// `storybook build` of the notes demo as the Chromatic workflow runs it:
// `pnpm build` of the packages, and the build against them. Both here, so
// that the Storybook has the packages of the tree. The time is the second's.
function runBuild(dir: string, outputDir: string): number {
  const run = (command: string[], cwd: string, log: string) => {
    const result = spawnSync("pnpm", command, {
      cwd,
      env: { ...process.env, STORYBOOK_DISABLE_TELEMETRY: "1" },
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
    fs.writeFileSync(path.join(outputDir, log), `${result.stdout}${result.stderr}`);
    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new Error(
        `pnpm ${command.join(" ")} failed with exit code ${result.status}:\n${result.stdout}${result.stderr}`,
      );
    }
  };
  console.log("Building the packages");
  run(["build"], repoRoot, "packages.log");
  console.log(
    `Building the Storybook of playground/nextjs-notes-demo into ${path.relative(repoRoot, dir)}`,
  );
  const started = performance.now();
  run(["exec", "storybook", "build", "--output-dir", dir], demo, "build.log");
  return performance.now() - started;
}

/** The size of each file of the build, by its path from the directory. */
function sizesOf(dir: string): Map<string, number> {
  const sizes = new Map<string, number>();
  for (const entry of fs.readdirSync(dir, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const file = path.join(entry.parentPath, entry.name);
    sizes.set(path.relative(dir, file).split(path.sep).join("/"), fs.statSync(file).size);
  }
  return sizes;
}

async function measureLoads(
  dir: string,
  stories: string[],
  profiles: Profile[],
  iterations: number,
  seed: number,
): Promise<{ loads: Load[]; machine: Record<string, string | number> }> {
  const sizes = sizesOf(dir);
  let site: Site | undefined;
  let browser: Browser | undefined;
  try {
    site = await serveBuild(dir);
    browser = await chromium.launch();
    console.log(
      `Chromium ${browser.version()}, ${iterations} iterations of ${stories.length} stories over ${profiles.join(" and ")}, seed ${seed}`,
    );

    // A cold and a warm load of each story that are not measured: the browser
    // starts its processes, and the server compresses the files.
    for (const story of stories) {
      await loadInNewContext(browser, site, sizes, story, "local", 0, () => {});
    }

    const loads: Load[] = [];
    const runs = profiles.flatMap((profile) => stories.map((story) => ({ profile, story })));
    const random = seeded(seed);
    for (let iteration = 1; iteration <= iterations; iteration++) {
      for (const { profile, story } of shuffled(runs, random)) {
        await loadInNewContext(browser, site, sizes, story, profile, iteration, (load) =>
          loads.push(load),
        );
      }
      console.log(`Iteration ${iteration}/${iterations} done`);
    }
    return { loads, machine: machine(browser) };
  } finally {
    await browser?.close();
    await site?.close();
  }
}

// A cold load in a new context, and then a warm one: a new page of the same
// context, with what the first put in the HTTP cache. The first page is
// closed first, as a preview iframe goes when the next story loads.
async function loadInNewContext(
  browser: Browser,
  site: Site,
  sizes: Map<string, number>,
  story: string,
  profile: Profile,
  iteration: number,
  record: (load: Load) => void,
): Promise<void> {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  try {
    await context.addInitScript(recordStory);
    for (const condition of ["cold", "warm"] as const) {
      const measured = await measureLoad(context, site, sizes, story, profile);
      record({ story, profile, condition, iteration, ...measured });
    }
  } finally {
    await context.close();
  }
}

// Runs in the preview before its scripts, in ms from the start of the
// navigation: the first frame with text of the story, and not Storybook's
// "preparing", the first with that and every stylesheet of the document
// loaded, and when the render of the story has ended, with its play
// function. A docs page shows its content once every story block on it has
// rendered: an inline story its root or an error, a story in an iframe the
// end of its render, as e2e/stories.ts of the notes demo waits for them. And
// a promise of the end.
function recordStory(): void {
  type Render = { id?: string; phase?: string };
  const story = window as {
    __STORYBOOK_PREVIEW__?: { currentRender?: Render };
    __story?: { contentAt?: number; styledAt?: number; doneAt?: number; phase?: string };
    __storyDone?: Promise<void>;
  };
  const query = new URLSearchParams(window.location.search);
  const id = query.get("id");
  const docs = query.get("viewMode") === "docs";
  const ended = ["finished", "errored", "aborted"];
  const marks: NonNullable<typeof story.__story> = (story.__story = {});
  const docsShown = () => {
    const blocks = Array.from(document.querySelectorAll("#storybook-docs .sb-story"));
    return (
      blocks.length > 0 &&
      blocks.every((block) => {
        const iframe = block.querySelector("iframe");
        if (iframe) {
          const preview = (iframe.contentWindow as typeof story | null)?.__STORYBOOK_PREVIEW__;
          return ended.includes(preview?.currentRender?.phase ?? "");
        }
        return (
          !!block.querySelector("pre") || !!block.querySelector('[id$="-inner"]')?.childElementCount
        );
      })
    );
  };
  let done: () => void;
  story.__storyDone = new Promise((resolve) => (done = resolve));
  const frame = () => {
    const body = document.body;
    if (body) {
      const preparing = /\bsb-show-preparing-(story|docs)\b/.test(body.className);
      const shown = docs ? docsShown() : !preparing && !!body.innerText.trim();
      if (shown) {
        marks.contentAt ??= performance.now();
        const stylesheets = document.querySelectorAll<HTMLLinkElement>('link[rel~="stylesheet"]');
        if (Array.from(stylesheets).every((link) => link.sheet || link.disabled)) {
          marks.styledAt ??= performance.now();
        }
      }
      const render = story.__STORYBOOK_PREVIEW__?.currentRender;
      const phase = docs ? (shown ? "finished" : undefined) : render?.phase;
      if (render?.id === id && marks.doneAt === undefined && ended.includes(phase ?? "")) {
        marks.doneAt = performance.now();
        marks.phase = phase;
      }
    }
    // A story that did not finish may never show styled.
    if (
      marks.doneAt !== undefined &&
      (marks.styledAt !== undefined || marks.phase !== "finished")
    ) {
      done();
    } else if (performance.now() < 120_000) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

async function measureLoad(
  context: BrowserContext,
  site: Site,
  sizes: Map<string, number>,
  story: string,
  profile: Profile,
): Promise<Omit<Load, "story" | "profile" | "condition" | "iteration">> {
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.stack ?? error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console.error: ${message.text()}`);
  });
  const network = await watchNetwork(context, page, profile);

  try {
    const viewMode = story.endsWith("--docs") ? "docs" : "story";
    await page.goto(`${site.url}iframe.html?${new URLSearchParams({ id: story, viewMode })}`, {
      waitUntil: "commit",
    });
    const ended = await page.evaluate((timeout) => {
      const { __storyDone } = window as { __storyDone?: Promise<void> };
      return Promise.race([
        __storyDone?.then(() => true),
        new Promise<false>((resolve) => setTimeout(() => resolve(false), timeout)),
      ]);
    }, 120_000);
    // Right after the end, for what the main thread did until then.
    const { metrics } = await network.cdp.send("Performance.getMetrics");
    const marks = await page.evaluate(
      () =>
        (
          window as {
            __story?: { contentAt?: number; styledAt?: number; doneAt?: number; phase?: string };
          }
        ).__story ?? {},
    );
    if (!ended || marks.phase !== "finished") {
      throw new Error(
        `The story ${story} ${ended ? `ended in "${marks.phase}"` : "did not end in 120 s"}.\n` +
          `Errors of the page:\n${errors.join("\n") || "(none)"}`,
      );
    }

    // What the page loads after the story ended, like an image or a font,
    // still counts: Chromatic waits for those before it takes a snapshot.
    const loading = await network.quiet();
    if (loading > 0) errors.push(`${loading} requests still loading after 10 s`);

    const timings = await page.evaluate(() => {
      const [navigation] = performance.getEntriesByType(
        "navigation",
      ) as PerformanceNavigationTiming[];
      return {
        domContentLoadedMs: navigation?.domContentLoadedEventEnd || undefined,
        firstContentfulPaintMs: performance
          .getEntriesByType("paint")
          .find((entry) => entry.name === "first-contentful-paint")?.startTime,
      };
    });
    const requestList = await network.requests(site, (file) => sizes.get(file), errors);
    const sum = (key: "transferBytes" | "resourceBytes") =>
      requestList.reduce((total, request) => total + request[key], 0);

    return {
      contentMs: marks.contentAt,
      styledMs: marks.styledAt,
      doneMs: marks.doneAt!,
      ...timings,
      taskMs: (metrics.find((entry) => entry.name === "TaskDuration")?.value ?? 0) * 1000,
      layers: layerRequestsOf(requestList),
      bound: transferAndChainOf(requestList, marks.doneAt!, profile),
      indexAfterSsrMs: hostRequestAfterSsrOf(requestList, "/index.json"),
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

function summarize(loads: Load[], stories: string[], profiles: Profile[]): Summary[] {
  const summaries: Summary[] = [];
  for (const story of stories) {
    for (const profile of profiles) {
      for (const condition of ["cold", "warm"] as const) {
        const of = loads.filter(
          (load) =>
            load.story === story && load.profile === profile && load.condition === condition,
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
          story,
          profile,
          condition,
          loads: of.length,
          styledMs: at((load) => load.styledMs),
          doneMs: at((load) => load.doneMs),
          taskMs: at((load) => load.taskMs),
          layers,
          wireMs: at((load) => load.bound.wireMs),
          waves: at((load) => load.bound.waves),
          idleMs: at((load) => load.bound.idleMs),
          indexAfterSsrMs: at((load) => load.indexAfterSsrMs),
          requests: at((load) => load.requests),
          serverRequests: at((load) => load.serverRequests),
          transferBytes: at((load) => load.transferBytes),
          transferBytesByKind: Object.fromEntries(
            kinds.map((kind) => [kind, at((load) => load.byKind[kind].transferBytes)]),
          ) as Summary["transferBytesByKind"],
        });
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
    build: { buildMs: number | undefined };
  },
  summaries: Summary[],
  loads: Load[],
): Promise<void> {
  const { buildMs } = results.build;
  const lines = [
    `# Storybook Page Load Summary`,
    ``,
    `Label: ${results.label}`,
    `Created: ${results.createdAt}`,
    `Commit: ${results.repo.sha} (${results.repo.branch})`,
    `Machine: ${Object.entries(results.machine)
      .map(([name, value]) => `${name} ${value}`)
      .join(", ")}`,
    `Built in: ${buildMs === undefined ? "n/a" : `${(buildMs / 1000).toFixed(1)} s`}`,
    ``,
    `The medians of ${results.iterations} loads of a story of \`storybook build\` of playground/nextjs-notes-demo in a tab of its own, \`iframe.html?id=…\`, per story, network and cache, in an order of seed ${results.seed}. These numbers are informational. The run fails on a story that does not finish, not on a number.`,
    ``,
    `- cold: a new browser context. warm: a second page of the context, after the first loaded the story.`,
    `- local: localhost as it is, where a request costs next to nothing, so the times are about the CPU. cable: 50 Mbit/s down, 10 up and 20 ms per request, as CDP emulates it, where the round trips show.`,
    `- The server of files serves the build as the README has a static host serve it: brotli, the files under assets/, _next/static/ and vitest-plugin-rsc/*/assets/ immutable, every other file with an ETag and \`no-cache\`, so a warm load asks for it again and gets a 304. "sent" is what came over the wire, headers included.`,
    `- styled ms: from the start of the navigation to the first frame with text of the story, not Storybook's "preparing", and every stylesheet of the document loaded. done ms: until the render of the story ended with its play function, or the docs page shows its content. busy ms: the time the main thread was busy until then, Chromium's \`TaskDuration\`.`,
    `- requests: all of the page, with the ones that reached the server in brackets, until the network is quiet. modules.json: the requests of each layer's file, with the 304s among them in brackets, and when the last ended.`,
    `- Until done, what the load waited for, in two parts. wire ms, transfer-bound: the bytes on the wire at the download rate of the network, none on localhost. Chain-bound: the serial waves of its requests to the server (one the cache answers costs no round trip), and idle ms, the time between them in which no request was in flight. index after ssr ms: when Storybook asked for \`index.json\`, after the ssr layer's \`modules.json\` ended; negative when it did not wait for it.`,
    ``,
  ];
  const layers = [...new Set(summaries.flatMap((summary) => Object.keys(summary.layers)))].sort();
  lines.push(
    `## Page Loads`,
    ``,
    `| story | network | cache | sent | requests | styled ms | done ms | busy ms | wire ms | waves | idle ms | index after ssr ms | ${layers.map((layer) => `${layer} modules.json | ends ms`).join(" | ")} |`,
    `| --- | --- | --- | --: | --: | --: | --: | --: | --: | --: | --: | --: | ${layers.map(() => "--: | --:").join(" | ")} |`,
  );
  for (const summary of summaries) {
    const ofLayers = layers.map((layer) => {
      const of = summary.layers[layer];
      return of
        ? `${count(of.requests)} (${count(of.revalidated)}) | ${formatMs(of.endMs)}`
        : "0 | n/a";
    });
    lines.push(
      `| \`${summary.story}\` | ${summary.profile} | ${summary.condition} | ${formatKilobytes(summary.transferBytes)} | ${count(summary.requests)} (${count(summary.serverRequests)}) | ${formatMs(summary.styledMs)} | ${formatMs(summary.doneMs)} | ${formatMs(summary.taskMs)} | ${formatMs(summary.wireMs)} | ${count(summary.waves)} | ${formatMs(summary.idleMs)} | ${formatMs(summary.indexAfterSsrMs)} | ${ofLayers.join(" | ")} |`,
    );
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
    `| story | ${shown.join(" | ")} |`,
    `| --- | ${shown.map(() => "--:").join(" | ")} |`,
  );
  for (const summary of summaries.filter(
    (summary) => summary.condition === "cold" && summary.profile === profile,
  )) {
    lines.push(
      `| \`${summary.story}\` | ${shown.map((kind) => formatKilobytes(summary.transferBytesByKind[kind])).join(" | ")} |`,
    );
  }

  const withErrors = loads.filter((load) => load.errors.length > 0);
  if (withErrors.length > 0) {
    lines.push(``, `## Errors Of The Pages`, ``);
    for (const load of withErrors) {
      lines.push(
        `- ${load.profile} ${load.condition} \`${load.story}\` #${load.iteration}: ${load.errors.map((error) => error.split("\n")[0]).join("; ")}`,
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
