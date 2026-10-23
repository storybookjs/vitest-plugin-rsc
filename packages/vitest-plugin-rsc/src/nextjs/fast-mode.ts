import { registry } from "./registry.ts";

// The fast mode of `vitestPluginNext({ fast: true })`: what it changes in the
// page, for a quick feedback loop, like an agent's, at the cost of some of
// what a test sees of a browser. See `VitestPluginNextOptions.fast`.
//
// What the dev server answers about the files of a test, like the
// stylesheets of a route or whether a module changed, does not change while
// a test file runs: a change of a file runs the file again. So in fast mode
// an answer is kept until the test file ends, where it is asked for again
// for every page and every test otherwise. The caches are the registry's,
// as the layers that ask are module graphs of their own.

const caches = () => (registry.testFileCaches ??= new Set());

/** Whether the page runs in fast mode. */
export function fastMode(): boolean {
  return registry.fast === true;
}

/**
 * What `ask` answers for `key`: in fast mode the answer of the first time in
 * the test file, else a new one. An answer that fails is asked for again.
 */
export function oncePerTestFile<T>(
  cache: Map<string, Promise<T>>,
  key: string,
  ask: () => Promise<T>,
): Promise<T> {
  if (!fastMode()) return ask();
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
// milliseconds late: about a fifth of the time of a suite. In fast mode it
// looks again on every change of the DOM, and every few milliseconds besides.
const findInterval = 5;
// On the function, as the module may be evaluated again, like the setup
// file that calls this for every test file.
const onEveryChange = Symbol.for("vitest-plugin-rsc:find-on-every-change");

/** In fast mode, has `locator` (a Locator of `vitest/browser`) look on every change of the DOM. */
export function findOnEveryChange(locator: object): void {
  if (!fastMode()) return;
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
  async function find(this: Locator, options: FindOptions = {}): Promise<Element> {
    const strict = options.strict ?? true;
    // Without a timeout of the caller's, the assertion that waits gives up
    // long before this stops looking.
    const timeout = options.timeout ?? 60_000;
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
