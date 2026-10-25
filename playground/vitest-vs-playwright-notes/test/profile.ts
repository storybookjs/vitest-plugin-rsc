import { afterAll, afterEach, beforeAll, beforeEach } from "vitest";
import { db } from "#lib/db.ts";

// The CPU profile of a test file, of vitest.profile.config.ts, its trace of
// Chrome with `VITEST_PROFILE=trace`, or with `VITEST_PROFILE=timings` when
// each test, each request of the page, each Flight render and each query of
// the database started and ended, which test/timings-summary.py sums up.

declare module "vitest/browser" {
  interface BrowserCommands {
    startProfile(): Promise<void>;
    stopProfile(name: string): Promise<void>;
    startTrace(): Promise<void>;
    stopTrace(name: string): Promise<void>;
    writeTimings(name: string, timings: string): Promise<void>;
  }
}

type Span = [start: number, end: number];
// A render of Flight: when it started, when React wrote its last byte, and
// when what reads it had read that.
type Render = [start: number, written: number, read: number];
type Registry = {
  requestTimings?: unknown[];
  flightServer: { renderToReadableStream(...args: unknown[]): ReadableStream<Uint8Array> };
};

const mode = import.meta.env.VITEST_PROFILE as string;
// The commands of vitest.profile.config.ts, or in a DOM of Node.js their
// stand-ins: see the file.
const { commands } = import.meta.env.VITEST_DOM
  ? await import("./profile-commands.node.ts")
  : await import("vitest/browser");
const registry = (globalThis as { __vitest_plugin_rsc_next__?: Registry })
  .__vitest_plugin_rsc_next__!;
let name = "";
// The timings of the current test file, on globalThis: the setup file runs
// again for every test file, but wraps once, and the wrappers of the first
// file push to the timings of each file after it.
const current = Symbol.for("test/profile.ts timings");
type Timings = { tests: Span[]; flight: Render[]; queries: Span[] };
const store = globalThis as { [current]?: Timings };
const timings = () => store[current]!;

// Wrapped once: the setup file runs again for every test file.
const wrapped = Symbol.for("test/profile.ts");
function timed<T extends object>(
  target: T,
  key: keyof T,
  onEnd: (span: [number, number, number]) => void,
): void {
  const original = target[key] as ((...args: unknown[]) => unknown) & { [wrapped]?: true };
  if (original[wrapped]) return;
  target[key] = Object.assign(
    function (this: unknown, ...args: unknown[]) {
      const start = performance.now();
      const result = original.apply(this, args);
      if (result instanceof ReadableStream) {
        // A render of Flight ends with its stream. One branch is read at
        // once, for when React wrote its last byte; the other goes on to
        // what reads it, for when that had read it all.
        const [written, read] = (result as ReadableStream<Uint8Array>).tee();
        let writtenAt = 0;
        void written.pipeTo(
          new WritableStream({ close: () => void (writtenAt = performance.now()) }),
        );
        return read.pipeThrough(
          new TransformStream({
            flush: () => onEnd([start, writtenAt || performance.now(), performance.now()]),
          }),
        );
      }
      if (result instanceof Promise) {
        const end = () => onEnd([start, performance.now(), performance.now()]);
        result.then(end, end);
      }
      return result;
    },
    { [wrapped]: true as const },
  ) as T[keyof T];
}

// A moment that the CPU profile and `performance.now()` both have: when this
// function, which the profile names, started. So test/profile-summary.py can
// tell the phase of each sample of the profile.
let profileStart: number | undefined;
function __profileSync(): number {
  const start = performance.now();
  while (performance.now() - start < 5) {
    // Busy, for samples of its own.
  }
  return start;
}
// oxlint-disable-next-line no-empty-pattern
beforeAll(async ({}, suite) => {
  name = suite.file.name.replace(/\W+/g, "-");
  store[current] = { tests: [], flight: [], queries: [] };
  // The timings go with a CPU profile too, which they hardly slow down.
  if (mode !== "trace") {
    registry.requestTimings = [];
    timed(registry.flightServer, "renderToReadableStream", (span) => timings().flight.push(span));
    const client = (db as unknown as { $client: Record<string, unknown> }).$client;
    timed(client, "query" as never, ([start, end]) => timings().queries.push([start, end]));
    timed(client, "exec" as never, ([start, end]) => timings().queries.push([start, end]));
  }
  if (mode === "trace") await commands.startTrace();
  else if (mode !== "timings") {
    await commands.startProfile();
    profileStart = __profileSync();
  }
});
let testStart = 0;
beforeEach(() => void (testStart = performance.now()));
afterEach(() => void timings().tests.push([testStart, performance.now()]));
afterAll(async () => {
  if (mode === "trace") return commands.stopTrace(name);
  if (mode !== "timings") await commands.stopProfile(name);
  const { tests, flight, queries } = timings();
  const file = { tests, requests: registry.requestTimings, flight, queries, profileStart };
  registry.requestTimings = undefined;
  await commands.writeTimings(name, JSON.stringify(file));
});
