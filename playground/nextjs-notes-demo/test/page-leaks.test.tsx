import { afterAll, expect, inject, test } from "vitest";
import type { Mode } from "vitest-plugin-rsc/nextjs/plugin";
import { db } from "#lib/db.ts";
import { notes } from "#db/schema.ts";
import { signedInAs, testUser } from "#test/auth.ts";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";

// What a page leaves behind once it is left: the plugin releases what React
// and Next added to `window` and `document`, and what was set on the document,
// `<html>` and `<head>` while the page was open (see "Not Yet" in
// docs/internals/next-routes.md). The test opens /notes again and again, with a
// Server Action and a navigation on each page, and checks that nothing grows
// from one page to the next once the first pages have loaded what loads once.
// It runs in Chromium and in the Node projects (happy-dom, jsdom), where the
// plugin is the page's host itself. In fast mode the pages render in one app,
// which it checks does not grow either.

declare module "vitest" {
  interface ProvidedContext {
    // The `mode` of the plugin: see vitest.config.ts.
    mode: Mode;
  }
}

const PAGES = 20;
const WARMUP = 5;

const isNodeHost = typeof globalThis.process?.getBuiltinModule === "function";

// How many functions a call of `addEventListener` passes through before it
// reaches the counting one below: each one that wraps the method after it,
// and stays, is a frame more of the stack.
const probe = {
  type: "vitest-plugin-rsc:leak-probe",
  // The stack in the counting function: `stack()`, the counting function,
  // the wrappers, `wrappers()` and its callers.
  reached: undefined as string[] | undefined,
  wrappers(target: EventTarget) {
    // `stack()`, `wrappers()` and its callers.
    const at = stack();
    const listener = () => {};
    this.reached = undefined;
    target.addEventListener(this.type, listener);
    target.removeEventListener(this.type, listener);
    const reached = this.reached as string[] | undefined;
    if (!reached) throw new Error("A wrapper of addEventListener did not call the one below it.");
    return reached.slice(2, reached.length - at.length + 1).map((frame) => frame.trim());
  },
};

function stack() {
  const limit = Error.stackTraceLimit;
  Error.stackTraceLimit = Infinity;
  try {
    return (new Error().stack ?? "").split("\n").slice(1);
  } finally {
    Error.stackTraceLimit = limit;
  }
}

// The listeners of `window` and `document` that are added from here on and not
// removed. Counting starts as the file loads, after the setup files: what was
// there before stays the same from page to page, and only growth counts. A
// `once` listener is not counted, as nothing says when it has fired.
type Listener = { type: string; capture: boolean; name: string };
const listening = new Map<EventTarget, Map<EventListenerOrEventListenerObject, Listener[]>>();
let counting = true;

function countListeners(target: EventTarget) {
  const own = {
    addEventListener: Object.getOwnPropertyDescriptor(target, "addEventListener"),
    removeEventListener: Object.getOwnPropertyDescriptor(target, "removeEventListener"),
  };
  const add = target.addEventListener;
  const remove = target.removeEventListener;
  const listeners = new Map<EventListenerOrEventListenerObject, Listener[]>();
  listening.set(target, listeners);
  const captures = (options?: boolean | EventListenerOptions | null) =>
    typeof options === "boolean" ? options : Boolean(options?.capture);
  const forget = (type: string, listener: EventListenerOrEventListenerObject, capture: boolean) => {
    const left = listeners
      .get(listener)
      ?.filter((it) => it.type !== type || it.capture !== capture);
    if (left?.length) listeners.set(listener, left);
    else listeners.delete(listener);
  };
  const count = (type: string, listener: EventListenerOrEventListenerObject, capture: boolean) => {
    const added = listeners.get(listener) ?? [];
    if (added.some((it) => it.type === type && it.capture === capture)) return;
    const name = typeof listener === "function" ? listener.name : listener.constructor.name;
    listeners.set(listener, [...added, { type, capture, name: name || "anonymous" }]);
  };
  const addCounted: EventTarget["addEventListener"] = function (
    this: unknown,
    type,
    listener,
    options,
  ) {
    if (type === probe.type) probe.reached = stack();
    // `this` is undefined for a call of the global `addEventListener()`.
    add.call(this ?? target, type, listener, options);
    if (!counting || !listener) return;
    if (typeof options === "object" && options) {
      // The DOM adds no listener with a signal that has aborted.
      if (options.once || options.signal?.aborted) return;
      const capture = captures(options);
      options.signal?.addEventListener("abort", () => forget(type, listener, capture), {
        once: true,
      });
    }
    count(type, listener, captures(options));
  };
  const removeCounted: EventTarget["removeEventListener"] = function (
    this: unknown,
    type,
    listener,
    options,
  ) {
    remove.call(this ?? target, type, listener, options);
    if (counting && listener) forget(type, listener, captures(options));
  };
  target.addEventListener = addCounted;
  target.removeEventListener = removeCounted;
  // The other files of the worker share the window. The methods go back by
  // assignment: in a Node.js worker they are an accessor of Vitest's on the
  // global, whose getter returns what was assigned last. One that was wrapped
  // since stays, and only passes the calls on.
  afterAll(() => {
    counting = false;
    listeners.clear();
    const methods = [
      ["addEventListener", addCounted, add],
      ["removeEventListener", removeCounted, remove],
    ] as const;
    for (const [key, counted, original] of methods) {
      if (target[key] !== counted) continue;
      if (own[key]) (target as Record<typeof key, unknown>)[key] = original;
      else delete (target as Partial<EventTarget>)[key];
    }
  });
}

countListeners(window);
countListeners(document);

// A collection of the whole heap: in Node, with the collector that V8 exposes
// with its flag, and in Chromium, which the browser projects start with that
// flag (vitest.config.ts).
const collect = isNodeHost ? exposeGc() : (globalThis as { gc?: () => void }).gc;

function exposeGc(): () => void {
  const v8 = process.getBuiltinModule("node:v8");
  const vm = process.getBuiltinModule("node:vm");
  v8.setFlagsFromString("--expose-gc");
  return vm.runInNewContext("gc") as () => void;
}

function collectAll() {
  expect(collect, "a collector of the heap").toBeTypeOf("function");
  collect!();
  collect!();
}

// The heap after a collection: Chromium's is precise with the flag
// `--enable-precise-memory-info`, which the browser projects start with too.
function heapUsed() {
  collectAll();
  if (isNodeHost) return process.memoryUsage().heapUsed;
  return (performance as { memory?: { usedJSHeapSize: number } }).memory!.usedJSHeapSize;
}

// Not in Chromium in fidelity mode yet: React keeps a page whose commit
// waited for a stylesheet until its timeout of a minute, by a timer that the
// plugin keeps from calling once the page is left but does not clear
// (packages/vitest-plugin-rsc/src/timers.ts). Whether a commit waits depends
// on when the stylesheet loads, so the heap grows by 0 to 2 MB a page there
// (SB-2416).
const measuresHeap = isNodeHost || inject("mode") === "fast";

type Sample = {
  listeners: Record<"window" | "document", string[]>;
  wrappers: Record<"window" | "document", string[]>;
  properties: Record<"window" | "document" | "html" | "head", string[]>;
  stylesheets: string[];
};

// The names of what is there, with what differs from page to page left out:
// the random suffix of React's keys, the query of a stylesheet's URL.
const ownKeys = (target: object) =>
  Reflect.ownKeys(target).map((key) =>
    String(key).replace(/^(__react\w+\$|_reactListening)[a-z0-9]+$/, "$1"),
  );

const describeListener = (listener: Listener) =>
  `${listener.type}${listener.capture ? " (capture)" : ""}: ${listener.name}`;

function sample(): Sample {
  const listeners = (target: EventTarget) =>
    [...listening.get(target)!.values()].flat().map(describeListener);
  return {
    listeners: { window: listeners(window), document: listeners(document) },
    wrappers: { window: probe.wrappers(window), document: probe.wrappers(document) },
    properties: {
      window: ownKeys(window),
      document: ownKeys(document),
      html: ownKeys(document.documentElement),
      head: ownKeys(document.head),
    },
    stylesheets: [...document.head.querySelectorAll("style, link[rel~=stylesheet]")].map((it) =>
      it instanceof HTMLLinkElement
        ? `<link href="${it.getAttribute("href")?.split("?")[0]}">`
        : `<style>${(it.textContent ?? "").slice(0, 60)}`,
    ),
  };
}

// Vitest keeps what an awaited assertion was about until the end of the test:
// an element would keep its page until then.
async function appeared<Found extends Element>(selector: string): Promise<Found> {
  await expect.poll(() => document.querySelector(selector) !== null).toBe(true);
  return document.querySelector<Found>(selector)!;
}

const samples: Sample[] = [];
// The heap once the pages of the warmup have been left, when no page is open.
let heapAfterWarmup = 0;
// The `<body>` of each page, which goes with the page: one that is still there
// after a collection is of a page that something keeps.
const bodies: WeakRef<HTMLElement>[] = [];

// A page in each test, as in a suite: the plugin leaves it as the test ends.
test.for(Array.from({ length: PAGES }, (_, index) => index))(
  "opens /notes, with a Server Action and a navigation: page %i",
  async (index) => {
    if (index === WARMUP && measuresHeap) heapAfterWarmup = heapUsed();
    await signedInAs();
    await db.insert(notes).values({ ownerId: testUser.id, title: "Leaky note" });
    await renderServer({ url: "/notes" });

    // A Server Action: the star of the note.
    (await appeared<HTMLButtonElement>('button[aria-pressed="false"]')).click();
    await appeared('button[aria-pressed="true"]');

    // A navigation of Next's router, to the page of the note.
    (await appeared<HTMLAnchorElement>('a[href^="/notes/"]:not([href="/notes/new"])')).click();
    await expect.poll(() => document.querySelector("h1")?.textContent).toBe("Leaky note");

    bodies.push(new WeakRef(document.body));
    samples.push(sample());
  },
);

// What there is of a kind after the last page and not after the first page
// after the warmup: the names of what grew, as many times as it grew.
function grown(of: (sample: Sample) => string[]) {
  const counts = new Map<string, number>();
  for (const name of of(samples[WARMUP]!)) counts.set(name, (counts.get(name) ?? 0) - 1);
  for (const name of of(samples.at(-1)!)) counts.set(name, (counts.get(name) ?? 0) + 1);
  return [...counts].filter(([, count]) => count > 0).map(([name, count]) => `${count}× ${name}`);
}

// Counts, not names: a name that differs from page to page would show as grown.
function expectNoGrowth(of: (sample: Sample) => string[]) {
  expect(samples).toHaveLength(PAGES);
  const counts = samples.slice(WARMUP).map((it) => of(it).length);
  expect(
    counts.at(-1),
    `per page after the warmup: ${counts.join(", ")}; grown: ${grown(of).join(", ")}`,
  ).toBeLessThanOrEqual(counts[0]!);
}

// A check of what a page leaves of a kind.
function leavesNo(name: string, of: (sample: Sample) => string[]) {
  test(name, () => expectNoGrowth(of));
}

leavesNo("leaves no listener on window", (it) => it.listeners.window);

leavesNo("leaves no listener on document", (it) => it.listeners.document);

leavesNo("leaves no wrapper of addEventListener on window", (it) => it.wrappers.window);

leavesNo("leaves no wrapper of addEventListener on document", (it) => it.wrappers.document);

for (const target of ["window", "document", "html", "head"] as const) {
  leavesNo(`leaves no property on ${target}`, (it) => it.properties[target]);
}

leavesNo("leaves no stylesheet in the head", (it) => it.stylesheets);

// But for the last page: jsdom keeps the body of the page that was left last,
// until the next one, one page and no more.
test("keeps no body of a page that was left", () => {
  expect(bodies).toHaveLength(PAGES);
  collectAll();
  const kept = bodies.slice(WARMUP, -1).filter((body) => body.deref()).length;
  expect(kept, "pages left after the warmup whose body is kept").toBe(0);
});

// A page that is kept is the whole of its module graph: 2 to 3 MB in
// Chromium, 6 to 7 MB in a Node.js worker. Without one, the heap grows by 0.3
// to 0.8 MB a page, which no check here names yet. The bound is half a kept
// page; the check of the bodies above names a kept page. Both are read when
// no page is open.
test.runIf(measuresHeap)("grows the heap by less than a kept page would", () => {
  expect(heapAfterWarmup).toBeGreaterThan(0);
  const perPage = (heapUsed() - heapAfterWarmup) / (PAGES - WARMUP);
  const bound = isNodeHost ? 3072 : 1024;
  expect(Math.round(perPage / 1024), "kB of heap per page after the warmup").toBeLessThan(bound);
});
