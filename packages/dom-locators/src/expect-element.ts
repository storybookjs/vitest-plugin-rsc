// `expect.element()` for a run of Vitest without Browser Mode, in a DOM of
// Node.js, where Vitest has none: what `@vitest/browser` adds to `expect`,
// for a locator of the package or an element. `expect.poll()` of
// `findElement()`, which waits until the poll's time is up, of `query()` for
// `.not.toBeInTheDocument()` and of `elements()` for `toHaveLength()`; as
// long as the caller's `timeout`, else until just before the test times
// out, as Vitest's own. In
// Browser Mode Vitest's own stays. Imported for its effect, by a setup file.
// The matchers, like `toBeInTheDocument()`, are a library's of the DOM, like
// `@testing-library/jest-dom/vitest`.

import { chai, expect } from "vitest";
import { defaultTimeout } from "./environment.ts";
import { DomLocator } from "./locator.ts";

type Options = { timeout?: number; interval?: number };
type Subject = Element | DomLocator | null | undefined;

// The test's own `performance` may be fake.
const now = performance.now.bind(performance);
// How much longer the poll waits than the locator: a locator that finds
// nothing fails the poll with its own error, which names it, and not with
// the poll's, which runs out at the same time.
const margin = 50;

function element(subject: Subject, options: Options = {}) {
  if (subject != null && !(subject instanceof Element) && !(subject instanceof DomLocator)) {
    throw new TypeError(
      `expect.element() takes an element or a locator of dom-locators, not ${String(subject)}.`,
    );
  }
  const timeout = options.timeout ?? defaultTimeout();
  const deadline = now() + timeout;
  const assertion = expect.poll(
    async function (this: object) {
      if (!(subject instanceof DomLocator)) return subject;
      const negated = chai.util.flag(this, "negate") as boolean | undefined;
      const name = chai.util.flag(this, "_name") as string | undefined;
      if (negated && name === "toBeInTheDocument") return subject.query();
      if (name === "toHaveLength") return subject.elements();
      return subject.findElement({ timeout: Math.max(deadline - now(), 0) });
    },
    { ...options, timeout: timeout + margin },
  );
  // Vitest's name for it in its messages.
  chai.util.flag(assertion, "_poll.element", true);
  return assertion;
}

const scope = expect as unknown as { element?: typeof element };
scope.element ??= element;
