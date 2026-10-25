import type { SpeedFeature } from "./mode.ts";
import { registry } from "./registry.ts";

// The speed features in the page: whether one is on, and what `cacheDevServer`
// and `watchDom` do there. Which are on, the mode of `vitestPluginNext()` and
// the options of the features decide: see `SpeedOptions` in mode.ts.
//
// What the dev server answers about the files of a test, like the
// stylesheets of a route or whether a module changed, does not change while
// a test file runs: a change of a file runs the file again. So with
// `cacheDevServer` an answer is kept until the test file ends, where it is
// asked for again for every page and every test otherwise. The caches are
// the registry's, as the layers that ask are module graphs of their own.

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
}

// Vitest's `expect.element()` looks for an element that is not there yet
// again after 0, 20, 50, 100, 100 and then every 500 ms. A Server Action or a
// navigation here takes 15 to 30 ms, so the test noticed most of them tens of
// milliseconds late: about a fifth of the time of a suite. With `watchDom` it
// looks again on every change of the DOM, and every few milliseconds besides.
const findInterval = 5;
// On the function, as the module may be evaluated again, like the setup
// file that calls this for every test file.
const onEveryChange = Symbol.for("vitest-plugin-rsc:find-on-every-change");

/** With `watchDom`, has `locator` (a Locator of `vitest/browser`) look on every change of the DOM. */
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
  // A test's own timers may be fake.
  const setTimeout = globalThis.setTimeout;
  const clearTimeout = globalThis.clearTimeout;
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
      await new Promise<void>((resolve) => {
        const done = () => {
          observer.disconnect();
          clearTimeout(timer);
          resolve();
        };
        const observer = new MutationObserver(done);
        const timer = setTimeout(done, findInterval);
        observer.observe(document, {
          subtree: true,
          childList: true,
          attributes: true,
          characterData: true,
        });
      });
    }
  }
  proto.findElement = Object.assign(find, { [onEveryChange]: true });
}

// `expect.element()` of a locator looks again `expect.poll.interval` after a
// matcher fails on the element it found: a text that a Server Action changes,
// a class that a click sets. With `watchDom` every look after the first
// waits for the next change of the DOM instead, or `findInterval` for what
// changes without one, like the value or the focus of an input. Not of an
// element, which the matcher reads again as it is: that one keeps Vitest's
// interval.
const onEveryChangeAfterMatch = Symbol.for("vitest-plugin-rsc:match-on-every-change");

/** With `watchDom`, has `expect.element()` of a locator look again on the next change of the DOM. */
export function matchOnEveryChange(expect: { element?: unknown }): void {
  if (!speedFeature("watchDom")) return;
  const vitests = expect.element as
    | ((this: unknown, target: unknown, options?: { interval?: number }) => unknown)
    | undefined;
  if (typeof vitests !== "function" || onEveryChangeAfterMatch in vitests) return;
  function element(this: unknown, target: unknown, options?: { interval?: number }) {
    const locator =
      typeof target === "object" &&
      target !== null &&
      !(target instanceof Element) &&
      typeof (target as { findElement?: unknown }).findElement === "function";
    if (!locator || options?.interval !== undefined) return vitests!.call(this, target, options);
    return vitests!.call(this, looksAfterChange(target), { ...options, interval: 0 });
  }
  expect.element = Object.assign(element, { [onEveryChangeAfterMatch]: true });
}

// The looks of one `expect.element()`: the locator, each of whose looks after
// the first waits until the DOM has changed since the one before, or
// `findInterval`. A look of Vitest's is one of these three.
const looks = new Set<PropertyKey>(["findElement", "query", "elements"]);

function looksAfterChange<T extends object>(locator: T): T {
  // A test's own timers may be fake.
  const setTimeout = globalThis.setTimeout;
  const clearTimeout = globalThis.clearTimeout;
  let changed: Promise<void> | undefined;
  // Watches from one look on, until the DOM changes or `findInterval` is over.
  const watch = () =>
    new Promise<void>((resolve) => {
      const done = () => {
        observer.disconnect();
        clearTimeout(timer);
        resolve();
      };
      const observer = new MutationObserver(done);
      const timer = setTimeout(done, findInterval);
      observer.observe(document, {
        subtree: true,
        childList: true,
        attributes: true,
        characterData: true,
      });
    });
  // Bound to the locator, whose class has private fields.
  return new Proxy(locator, {
    get(target, key) {
      const value = Reflect.get(target, key, target) as unknown;
      if (typeof value !== "function") return value;
      if (!looks.has(key)) return value.bind(target);
      return async (...args: unknown[]) => {
        if (changed) await changed;
        try {
          return await value.apply(target, args);
        } finally {
          changed = watch();
        }
      };
    },
  });
}
