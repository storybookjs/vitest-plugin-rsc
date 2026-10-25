import { forgetCheckedVersions } from "../utils.ts";
import type { SpeedFeature } from "./mode.ts";
import { registry } from "./registry.ts";

// The speed features in the page: whether one is on, and what `cacheDevServer`
// and `watchDom` do there. Which are on, the mode of `vitestPluginNext()` and
// the options of the features decide: see `SpeedOptions` in mode.ts.
//
// What the dev server answers about the files of a test, like the
// stylesheets of the host's files or whether a module changed, seldom changes
// while a test file runs: in watch mode a change of a file runs the file
// again. So with `cacheDevServer` an answer is kept until the test file ends,
// where it is asked for again for every page and every test otherwise. The
// caches are the registry's, as the layers that ask are module graphs of their
// own.

const caches = () => (registry.testFileCaches ??= new Set());

/** Whether a speed feature is on in the page. */
export function speedFeature(feature: SpeedFeature): boolean {
  return registry.speedFeatures?.[feature] === true;
}

/**
 * What `ask` answers for `key`: with `cacheDevServer` the answer of the first
 * time in the test file, else a new one. An answer that fails is asked for
 * again.
 */
export function oncePerTestFile<T>(
  cache: Map<string, Promise<T>>,
  key: string,
  ask: () => Promise<T>,
): Promise<T> {
  if (!speedFeature("cacheDevServer")) return ask();
  caches().add(cache as Map<string, Promise<unknown>>);
  let answer = cache.get(key);
  if (!answer) {
    answer = ask();
    cache.set(key, answer);
    answer.catch(() => cache.delete(key));
  }
  return answer;
}

/** Forgets the answers of `oncePerTestFile()`, as a test file ends. */
export function forgetTestFileAnswers(): void {
  for (const cache of caches()) cache.clear();
  forgetCheckedVersions();
}

// Vitest's `expect.element()` looks for an element that is not there yet
// again after 0, 20, 50, 100, 100 and then every 500 ms. A Server Action or a
// navigation here takes 15 to 30 ms, so the test noticed most of them tens of
// milliseconds late: about a fifth of the time of a suite. With `watchDom` it
// looks again on the next change: see `nextChange()`.
const findInterval = 5;
// A test's own timers may be fake.
const setTimeout = globalThis.setTimeout;
const clearTimeout = globalThis.clearTimeout;

// What a page changes without a mutation of the DOM: the value of a field and
// whether it is checked, the focus, a stylesheet or an image that loaded, and
// a transition or an animation that ended, which `toBeVisible()` reads. In the
// capture phase, as some do not bubble.
const changeEvents = [
  "input",
  "change",
  "focusin",
  "focusout",
  "load",
  "error",
  "transitionend",
  "animationend",
];
const observed: MutationObserverInit = {
  subtree: true,
  childList: true,
  attributes: true,
  characterData: true,
};

/**
 * Resolves on the next change of the document from now on: a mutation of the
 * DOM, one of `changeEvents`, or `findInterval` for what changes without
 * either, like a value that a script sets.
 */
function nextChange(): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      observer.disconnect();
      clearTimeout(timer);
      for (const type of changeEvents) document.removeEventListener(type, done, true);
      resolve();
    };
    const observer = new MutationObserver(done);
    observer.observe(document, observed);
    for (const type of changeEvents) document.addEventListener(type, done, true);
    const timer = setTimeout(done, findInterval);
  });
}

// On the function, as the module may be evaluated again, like the setup
// file that calls this for every test file.
const onEveryChange = Symbol.for("vitest-plugin-rsc:find-on-every-change");

/** With `watchDom`, has `locator` (a Locator of `vitest/browser`) look on every change of the document. */
export function findOnEveryChange(locator: object): void {
  if (!speedFeature("watchDom")) return;
  let proto: { findElement?: unknown } | null = Object.getPrototypeOf(locator);
  while (proto && !Object.prototype.hasOwnProperty.call(proto, "findElement")) {
    proto = Object.getPrototypeOf(proto);
  }
  if (!proto || typeof proto.findElement !== "function" || onEveryChange in proto.findElement) {
    return;
  }
  type Locator = { elements(): Element[]; findElement: typeof find };
  type FindOptions = { strict?: boolean; timeout?: number };
  const vitests = proto.findElement as (this: Locator, options?: FindOptions) => Promise<Element>;
  // Without a timeout of the caller's, Vitest's own: until just before the
  // test times out, so a test fails with the locator in its error.
  type Runner = { runner?: { _deadline?: { derive(): number } } };
  const vitest = () =>
    (globalThis as { __vitest_browser_runner__?: Runner }).__vitest_browser_runner__;
  async function find(this: Locator, options: FindOptions = {}): Promise<Element> {
    const strict = options.strict ?? true;
    const timeout = options.timeout ?? vitest()?.runner?._deadline?.derive() ?? 60_000;
    const start = performance.now();
    for (;;) {
      const elements = this.elements();
      if (elements.length === 1 || (elements.length > 1 && !strict)) return elements[0]!;
      // Vitest's own error, for more than one element and for none in time.
      if (elements.length > 1 || performance.now() - start >= timeout) {
        return vitests.call(this, { ...options, timeout: 0 });
      }
      await nextChange();
    }
  }
  proto.findElement = Object.assign(find, { [onEveryChange]: true });
}

// `expect.poll()` calls its function again `expect.poll.interval` after the
// matcher failed, and so does `expect.element()`, which polls the element a
// locator finds: for a text that a Server Action changes, a class that a
// click sets. With `watchDom` every call after the first waits for the next
// change of the document since the call before instead. Not while the test's
// timers are fake, which Vitest advances by the interval between the calls,
// nor with an interval of the caller's: those keep Vitest's poll, at the
// caller's interval or the config's, which the plugin sets to 5 ms where the
// config has none (plugin.ts).
const pollsOnEveryChange = Symbol.for("vitest-plugin-rsc:poll-on-every-change");

type Poll = (this: unknown, fn: (...args: unknown[]) => unknown, options?: object) => unknown;

/** With `watchDom`, has `expect.poll()`, and so `expect.element()`, look again on the next change of the document. */
export function pollOnEveryChange(expect: { poll?: unknown }, fakeTimers: () => boolean): void {
  if (!speedFeature("watchDom")) return;
  const vitests = expect.poll as Poll | undefined;
  if (typeof vitests !== "function" || pollsOnEveryChange in vitests) return;
  function poll(this: unknown, fn: (...args: unknown[]) => unknown, options?: object) {
    if ((options as { interval?: number })?.interval !== undefined || fakeTimers()) {
      return vitests!.call(this, fn, options);
    }
    let changed: Promise<void> | undefined;
    // `this` is the assertion, whose flags `expect.element()` reads.
    async function polled(this: unknown, ...args: unknown[]) {
      if (changed) await changed;
      try {
        return await fn.apply(this, args);
      } finally {
        changed = nextChange();
      }
    }
    return vitests!.call(this, polled, { ...options, interval: 0 });
  }
  expect.poll = Object.assign(poll, { [pollsOnEveryChange]: true });
}
