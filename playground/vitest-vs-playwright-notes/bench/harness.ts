import { commands } from "vitest/browser";

// The harness of the benchmark of primitives (bench/*.test.tsx, run by
// vitest.bench.config.ts): `measure()` times one primitive, like a page load
// or a click, many times, and sends what it measured to Node, where
// bench/reporter.ts prints it as a table and writes it as JSON.

declare module "vitest/browser" {
  interface BrowserCommands {
    benchResult(json: string): Promise<void>;
    benchMarks(json: string): Promise<void>;
  }
}

/** A request of the page as the server saw it: `RequestTiming` of the plugin's registry. */
export type Timing = {
  method: string;
  url: string;
  kind: "action" | "flight" | "page";
  queued: number;
  started?: number;
  answered?: number;
  finished?: number;
};

type Registry = { requestTimings?: Timing[]; fast?: Record<string, boolean> };
const registry = (globalThis as { __vitest_plugin_rsc_next__?: Registry })
  .__vitest_plugin_rsc_next__!;

// The registry's `requestTimings`, which the server pushes each request to
// as it reaches it: an array that also tells who waits for the next one.
const listeners = new Set<(timing: Timing) => void>();
class Recorded extends Array<Timing> {
  override push(...items: Timing[]): number {
    const length = super.push(...items);
    for (const item of items) for (const listener of listeners) listener(item);
    return length;
  }
}

/** The requests of the page so far: the server records them from the first call on. */
export function requests(): Timing[] {
  if (!(registry.requestTimings instanceof Recorded)) registry.requestTimings = new Recorded();
  return registry.requestTimings;
}

/** The next request that reaches the server. */
export function nextRequest(timeout = 5_000): Promise<Timing> {
  requests();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      listeners.delete(listener);
      reject(new Error("No request reached the server"));
    }, timeout);
    const listener = (timing: Timing) => {
      listeners.delete(listener);
      clearTimeout(timer);
      resolve(timing);
    };
    listeners.add(listener);
  });
}

const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
const task = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

// A request the server has not finished. Not one that was dropped: a page
// that is left drops the requests that wait for the server, which then never
// start, and a request whose handling threw never finishes either. Each
// takes milliseconds, so one older than this is one of those.
const dropped = 3_000;
const pending = (timing: Timing) =>
  timing.finished === undefined && performance.now() - timing.queued < dropped;

/**
 * Until the server has finished every request, and the page sent no new
 * one for a frame: a prefetch of a link that came into view starts there.
 */
export async function serverIdle(timeout = 10_000): Promise<void> {
  const all = requests();
  const deadline = performance.now() + timeout;
  for (;;) {
    while (all.some(pending)) {
      if (performance.now() > deadline) throw new Error("The server did not finish its requests");
      await task();
    }
    const count = all.length;
    await frame();
    await task();
    if (all.length === count && !all.some(pending)) return;
  }
}

/**
 * When `check()` is true: at once, or at the change of the DOM that made it
 * true, by a MutationObserver. Its time by `performance.now()`.
 */
export function untilDom(check: () => boolean, timeout = 5_000): Promise<number> {
  if (check()) return Promise.resolve(performance.now());
  return new Promise((resolve, reject) => {
    const observer = new MutationObserver(() => {
      if (!check()) return;
      done();
      resolve(performance.now());
    });
    const timer = setTimeout(() => {
      done();
      reject(new Error(`untilDom: not true after ${timeout} ms: ${String(check)}`));
    }, timeout);
    const done = () => {
      observer.disconnect();
      clearTimeout(timer);
    };
    observer.observe(document, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
    });
  });
}

// The time the server was busy with requests between `from` and `to`: the
// union of each one's queued to finished, as the server takes one at a time.
function busy(timings: Timing[], from: number, to: number): number {
  const spans = timings
    .map((timing) => [Math.max(timing.queued, from), Math.min(timing.finished ?? to, to)])
    .filter(([start, end]) => end! > start!)
    .sort((a, b) => a[0]! - b[0]!);
  let total = 0;
  let [start, end] = [-Infinity, -Infinity];
  for (const [s, e] of spans) {
    if (s! > end) {
      if (end > start) total += end - start;
      [start, end] = [s!, e!];
    } else end = Math.max(end, e!);
  }
  if (end > start) total += end - start;
  return total;
}

export type Stats = {
  n: number;
  first: number;
  min: number;
  median: number;
  p90: number;
  max: number;
  mean: number;
};

export type Row = {
  name: string;
  mode: string;
  iterations: number;
  warmup: number;
  batch?: number;
  total: Stats;
  parts: Record<string, Stats>;
  /** Requests per iteration that reached the server while it was timed, by kind. */
  requests?: Record<string, number>;
  note?: string;
};

function stats(values: number[], first: number): Stats {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const at = (q: number) => sorted[Math.min(n - 1, Math.max(0, Math.ceil(q * n) - 1))]!;
  const median = n % 2 ? sorted[(n - 1) / 2]! : (sorted[n / 2 - 1]! + sorted[n / 2]!) / 2;
  return {
    n,
    first,
    min: sorted[0]!,
    median,
    p90: at(0.9),
    max: sorted[n - 1]!,
    mean: sorted.reduce((sum, value) => sum + value, 0) / n,
  };
}

/** The mode of the run, as vitest.bench.config.ts names it: `fast` or `fidelity`, and the build. */
export function mode(): string {
  return import.meta.env.BENCH_MODE as string;
}

/** Whether this speed feature is on: see `mode` of `vitestPluginNext()`. */
export function fastFeature(feature: string): boolean {
  return registry.fast?.[feature] === true;
}

/**
 * What an iteration measured itself, besides its wall time: `total` replaces
 * the wall time, every other number is a part of it, reported on its own.
 */
export type Sample = void | { total?: number; [part: string]: number | undefined };

export type MeasureOptions = {
  /** Timed iterations. */
  iterations?: number;
  /** Iterations before, not timed; the first of them is reported as `first`. */
  warmup?: number;
  /** Before each iteration, not timed. */
  before?: (i: number) => unknown;
  /** After each iteration, not timed. */
  after?: (i: number) => unknown;
  /**
   * Splits the time into the server's, the union of its requests from queued
   * to finished, and the client's, the rest; and waits, untimed, for the
   * server to be idle after each iteration.
   */
  split?: boolean;
  /**
   * Calls of `fn` per iteration, for what takes less than a millisecond: the
   * page's `performance.now()` has a resolution of 0.1 ms. The time of an
   * iteration is then the time of one call.
   */
  batch?: number;
  note?: string;
};

/**
 * Times `fn` `warmup + iterations` times by `performance.now()`, and reports
 * min, median, p90, max of the timed iterations, and the first iteration of
 * all apart.
 */
export async function measure(
  name: string,
  fn: (context: { i: number; start: number }) => Promise<Sample> | Sample,
  {
    iterations = 100,
    warmup = 5,
    before,
    after,
    split = false,
    batch = 1,
    note,
  }: MeasureOptions = {},
): Promise<Row> {
  const all = requests();
  const totals: number[] = [];
  const parts: Record<string, number[]> = {};
  const firstParts: Record<string, number> = {};
  const kinds: Record<string, number> = {};
  let first = 0;
  for (let i = 0; i < warmup + iterations; i++) {
    await before?.(i);
    const from = all.length;
    const start = performance.now();
    let sample: Sample = undefined;
    for (let call = 0; call < batch; call++) sample = await fn({ i, start });
    const end = performance.now();
    const own = sample ?? {};
    const total = own.total ?? (end - start) / batch;
    const values: Record<string, number> = {};
    for (const [part, value] of Object.entries(own)) {
      if (part !== "total" && typeof value === "number") values[part] = value;
    }
    const timed = all.slice(from).filter((timing) => timing.queued <= start + total);
    if (split) {
      const server = busy(timed, start, start + total);
      values.server = server;
      values.client = total - server;
    }
    await after?.(i);
    if (split) await serverIdle();
    if (i === 0) {
      first = total;
      Object.assign(firstParts, values);
    }
    if (i < warmup) continue;
    totals.push(total);
    for (const [part, value] of Object.entries(values)) (parts[part] ??= []).push(value);
    for (const timing of timed) kinds[timing.kind] = (kinds[timing.kind] ?? 0) + 1;
  }
  const row: Row = {
    name,
    mode: mode(),
    iterations,
    warmup,
    ...(batch > 1 && { batch }),
    total: stats(totals, first),
    parts: Object.fromEntries(
      Object.entries(parts).map(([part, values]) => [part, stats(values, firstParts[part] ?? 0)]),
    ),
    ...(Object.keys(kinds).length && {
      requests: Object.fromEntries(
        Object.entries(kinds).map(([kind, count]) => [kind, count / iterations]),
      ),
    }),
    ...(note && { note }),
  };
  await commands.benchResult(JSON.stringify(row));
  return row;
}
