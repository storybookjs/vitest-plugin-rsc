import { afterAll, expect, test } from "vitest";
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
// plugin is the page's host itself.

const PAGES = 20;
const WARMUP = 5;

const isNodeHost = typeof globalThis.process?.getBuiltinModule === "function";
const isJsdom = navigator.userAgent.includes("jsdom");

// How many functions a call of `addEventListener` passes through before it
// reaches the counting one below: each one that wraps the method after it,
// and stays, is a frame more of the stack.
const probe = {
  type: "vitest-plugin-rsc:leak-probe",
  // The stack in the counting function: `stack()`, the counting function,
  // the wrappers, `wrappers()` and its callers.
  reached: [] as string[],
  wrappers(target: EventTarget) {
    // `stack()`, `wrappers()` and its callers.
    const at = stack();
    const listener = () => {};
    target.addEventListener(this.type, listener);
    target.removeEventListener(this.type, listener);
    return this.reached.slice(2, this.reached.length - at.length + 1).map((it) => it.trim());
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

function countListeners(target: EventTarget) {
  const own = {
    add: Object.getOwnPropertyDescriptor(target, "addEventListener"),
    remove: Object.getOwnPropertyDescriptor(target, "removeEventListener"),
  };
  const add = target.addEventListener;
  const remove = target.removeEventListener;
  const listeners = new Map<EventListenerOrEventListenerObject, Listener[]>();
  listening.set(target, listeners);
  const captures = (options?: boolean | EventListenerOptions) =>
    typeof options === "boolean" ? options : Boolean(options?.capture);
  const forget = (type: string, listener: EventListenerOrEventListenerObject, capture: boolean) => {
    const of = listeners.get(listener)?.filter((it) => it.type !== type || it.capture !== capture);
    if (of?.length) listeners.set(listener, of);
    else listeners.delete(listener);
  };
  const counting: EventTarget["addEventListener"] = function (
    this: unknown,
    type,
    listener,
    options,
  ) {
    if (type === probe.type) probe.reached = stack();
    // `this` is undefined for a call of the global `addEventListener()`.
    add.call(this ?? target, type, listener, options);
    if (!listener || (typeof options === "object" && options.once)) return;
    const capture = captures(options);
    const of = listeners.get(listener) ?? [];
    if (of.some((it) => it.type === type && it.capture === capture)) return;
    const name = typeof listener === "function" ? listener.name : listener.constructor.name;
    listeners.set(listener, [...of, { type, capture, name: name || "anonymous" }]);
    if (typeof options === "object") {
      options.signal?.addEventListener("abort", () => forget(type, listener, capture));
    }
  };
  const uncounting: EventTarget["removeEventListener"] = function (
    this: unknown,
    type,
    listener,
    options,
  ) {
    remove.call(this ?? target, type, listener, options);
    if (listener) forget(type, listener, captures(options));
  };
  target.addEventListener = counting;
  target.removeEventListener = uncounting;
  // The other files of the worker share the window. A method that was
  // wrapped since stays, and passes the calls on.
  afterAll(() => {
    listeners.clear();
    const methods = [
      ["addEventListener", counting, own.add],
      ["removeEventListener", uncounting, own.remove],
    ] as const;
    for (const [key, method, descriptor] of methods) {
      if (target[key] !== method) continue;
      if (descriptor) Object.defineProperty(target, key, descriptor);
      else delete (target as Partial<EventTarget>)[key];
    }
  });
}

countListeners(window);
countListeners(document);

// A collection of the whole heap, where a test can ask for one: in Node, with
// the collector that V8 exposes with its flag, and in Chromium, which the
// browser projects start with that flag (vitest.config.ts).
const collect = isNodeHost ? exposeGc() : (globalThis as { gc?: () => void }).gc;

function exposeGc(): () => void {
  const v8 = process.getBuiltinModule("node:v8");
  const vm = process.getBuiltinModule("node:vm");
  v8.setFlagsFromString("--expose-gc");
  return vm.runInNewContext("gc") as () => void;
}

// The heap after a collection: Chromium's is precise with the flag
// `--enable-precise-memory-info`, which the browser projects start with too.
function heapUsed() {
  if (!collect) return undefined;
  collect();
  collect();
  if (isNodeHost) return process.memoryUsage().heapUsed;
  return (performance as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize;
}

// The `<body>` of each page, which goes with the page: one that is still there
// after a collection is of a page that something keeps.
const bodies: WeakRef<HTMLElement>[] = [];

type Sample = {
  listeners: Record<"window" | "document", Listener[]>;
  wrappers: Record<"window" | "document", string[]>;
  properties: Record<"window" | "document" | "html" | "head", string[]>;
  stylesheets: string[];
  heapUsed?: number;
};

// The names of what is there, with what differs from page to page left out:
// the random suffix of React's keys, the query of a stylesheet's URL.
const ownKeys = (target: object) =>
  Reflect.ownKeys(target).map((key) =>
    String(key).replace(/^(__react\w+\$|_reactListening)[a-z0-9]+$/, "$1"),
  );

function sample(withHeap: boolean): Sample {
  const listeners = (target: EventTarget) => [...listening.get(target)!.values()].flat();
  return {
    listeners: { window: listeners(window), document: listeners(document) },
    wrappers: { window: probe.wrappers(window), document: probe.wrappers(document) },
    properties: {
      window: ownKeys(window),
      document: ownKeys(document),
      html: ownKeys(document.documentElement),
      head: ownKeys(document.head),
    },
    stylesheets: [...document.head.querySelectorAll("style, link[rel=stylesheet]")].map((it) =>
      it instanceof HTMLLinkElement
        ? `<link href="${it.getAttribute("href")?.split("?")[0]}">`
        : `<style>${(it.textContent ?? "").slice(0, 60)}`,
    ),
    heapUsed: withHeap ? heapUsed() : undefined,
  };
}

// Vitest keeps what an awaited assertion was about until the end of the test:
// an element would keep its page until then.
async function find<Found extends Element>(selector: string): Promise<Found> {
  await expect.poll(() => document.querySelector(selector) !== null).toBe(true);
  return document.querySelector<Found>(selector)!;
}

const samples: Sample[] = [];

// A page in each test, as in a suite: the plugin leaves it as the test ends.
test.for(Array.from({ length: PAGES }, (_, index) => index))(
  "opens /notes, with a Server Action and a navigation: page %i",
  async (index) => {
    await signedInAs();
    await db.insert(notes).values({ ownerId: testUser.id, title: "Leaky note" });
    await renderServer({ url: "/notes" });

    // A Server Action: the star of the note.
    (await find<HTMLButtonElement>('button[aria-pressed="false"]')).click();
    await find('button[aria-pressed="true"]');

    // A navigation of Next's router, to the page of the note.
    (await find<HTMLAnchorElement>('a[href^="/notes/"]:not([href="/notes/new"])')).click();
    await expect.poll(() => document.querySelector("h1")?.textContent).toBe("Leaky note");

    bodies.push(new WeakRef(document.body));
    samples.push(sample(index === WARMUP || index === PAGES - 1));
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

// The count, as names that differ from page to page differ in what grew too.
function expectNoGrowth(of: (sample: Sample) => string[]) {
  expect(samples).toHaveLength(PAGES);
  const counts = samples.slice(WARMUP).map((it) => of(it).length);
  expect(
    counts.at(-1),
    `per page after the warmup: ${counts.join(", ")}; grown: ${grown(of).join(", ")}`,
  ).toBeLessThanOrEqual(counts[0]!);
}

const describeListener = (listener: Listener) =>
  `${listener.type}${listener.capture ? " (capture)" : ""}: ${listener.name}`;

// jsdom's selector engine adds 9 capture listeners to `window` for each
// document it parses, one of each page, and never removes them (SB-2419).
(isJsdom ? test.fails : test)("leaves no listener on window", () => {
  expectNoGrowth((it) => it.listeners.window.map(describeListener));
});

test("leaves no listener on document", () => {
  expectNoGrowth((it) => it.listeners.document.map(describeListener));
});

// In a Node.js worker, a recorder of leftovers.ts stays on `window`'s
// `addEventListener` when another one wrapped it after it, and keeps its page
// (SB-2419).
(isNodeHost ? test.fails : test)("leaves no wrapper of addEventListener on window", () => {
  expectNoGrowth((it) => it.wrappers.window);
});

test("leaves no wrapper of addEventListener on document", () => {
  expectNoGrowth((it) => it.wrappers.document);
});

test.each(["window", "document", "html", "head"] as const)("leaves no property on %s", (target) => {
  expectNoGrowth((it) => it.properties[target]);
});

test("leaves no stylesheet in the head", () => {
  expectNoGrowth((it) => it.stylesheets);
});

// A page that is left goes, with its `<body>`.
test.skipIf(!collect)("keeps no body of a page that was left", () => {
  collect!();
  const kept = bodies.slice(WARMUP, -1).filter((body) => body.deref()).length;
  expect(kept, "pages left after the warmup whose body is kept").toBe(0);
});

// A page that is kept is the whole of its module graph, megabytes; what a
// page leaves that keeps nothing else is small. The bound is between them.
// In a Node.js worker the heap grows by about 800 kB a page, though no body
// is kept: what grows is not known yet (SB-2419).
(!collect ? test.skip : isNodeHost ? test.fails : test)(
  "grows the heap by less than 512 kB a page",
  () => {
    const before = samples[WARMUP]!.heapUsed!;
    const perPage = (samples.at(-1)!.heapUsed! - before) / (PAGES - 1 - WARMUP);
    expect(Math.round(perPage / 1024), "kB of heap per page after the warmup").toBeLessThan(512);
  },
);
