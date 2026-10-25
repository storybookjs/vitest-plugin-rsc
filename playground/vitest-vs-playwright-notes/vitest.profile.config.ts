import { mkdir, writeFile } from "node:fs/promises";
import type { BrowserCommand } from "vitest/node";
import { mergeConfig } from "vitest/config";
import config from "./vitest.config.ts";

// vitest.config.ts, with a CPU profile of the page for every test file in
// profiles/, which test/profile-summary.py sums up: see the profile job of
// .github/workflows/vitest-vs-playwright.yml. A session of the profiler or
// the trace per page, by its Playwright page: with `--maxWorkers` above 1,
// each worker is a page of its own, profiled at the same time.

type Session = { send(method: string, params?: object): Promise<{ profile?: unknown }> };
const sessions = new Map<object, Session>();

const startProfile: BrowserCommand<[]> = async ({ page }) => {
  const session = (await page.context().newCDPSession(page)) as unknown as Session;
  sessions.set(page, session);
  await session.send("Profiler.enable");
  await session.send("Profiler.setSamplingInterval", { interval: 200 });
  await session.send("Profiler.start");
};

const stopProfile: BrowserCommand<[name: string]> = async ({ page }, name) => {
  const session = sessions.get(page);
  if (!session) return;
  sessions.delete(page);
  const { profile } = await session.send("Profiler.stop");
  await mkdir("profiles", { recursive: true });
  await writeFile(`profiles/${name}.cpuprofile`, JSON.stringify(profile));
};

// With `VITEST_PROFILE=trace`, a trace of Chrome in traces/ instead, which
// test/trace-summary.py sums up: what the browser itself does, like layout,
// style and the microtasks of promises, which a CPU profile calls
// `(program)`.
type TraceSession = Session & {
  on(event: "Tracing.dataCollected", listener: (data: { value: unknown[] }) => void): void;
  once(event: "Tracing.tracingComplete", listener: () => void): void;
};
const traces = new Map<
  object,
  { session: TraceSession; events: unknown[]; complete: Promise<void> }
>();

const startTrace: BrowserCommand<[]> = async ({ page }) => {
  const session = (await page.context().newCDPSession(page)) as unknown as TraceSession;
  const events: unknown[] = [];
  session.on("Tracing.dataCollected", ({ value }) => events.push(...value));
  const complete = new Promise<void>((resolve) => session.once("Tracing.tracingComplete", resolve));
  traces.set(page, { session, events, complete });
  await session.send("Tracing.start", {
    transferMode: "ReportEvents",
    traceConfig: {
      includedCategories: [
        "toplevel",
        "blink",
        "v8",
        "v8.execute",
        "devtools.timeline",
        "disabled-by-default-devtools.timeline",
        "disabled-by-default-v8.gc",
        "loading",
      ],
    },
  });
};

const stopTrace: BrowserCommand<[name: string]> = async ({ page }, name) => {
  const trace = traces.get(page);
  if (!trace) return;
  traces.delete(page);
  const { session, events, complete } = trace;
  await session.send("Tracing.end");
  await complete;
  await mkdir("traces", { recursive: true });
  await writeFile(`traces/${name}.json`, JSON.stringify(events));
};

// With `VITEST_PROFILE=timings`, the timings of test/profile.ts in timings/.
const writeTimings: BrowserCommand<[name: string, timings: string]> = async (
  _context,
  name,
  timings,
) => {
  await mkdir("timings", { recursive: true });
  await writeFile(`timings/${name}.json`, timings);
};

export default mergeConfig(config, {
  // What test/profile.ts reads, which Vite gives the page only for `VITE_*`.
  define: {
    // oxlint-disable-next-line no-process-env
    "import.meta.env.VITEST_PROFILE": JSON.stringify(process.env.VITEST_PROFILE ?? ""),
    // In a DOM of Node.js, test/profile.ts has the commands of its own.
    // oxlint-disable-next-line no-process-env
    "import.meta.env.VITEST_DOM": JSON.stringify(process.env.VITEST_DOM ?? ""),
  },
  test: {
    browser: { commands: { startProfile, stopProfile, startTrace, stopTrace, writeTimings } },
    setupFiles: ["./test/profile.ts"],
  },
});
