// The one wait of the package, for finds and actions: a look now, one more
// after each batch of changes of the DOM, and one every 50 ms besides, until
// what is looked for is there or the time is up.

// A test's own timers may be fake.
const setTimeout = globalThis.setTimeout;
const clearTimeout = globalThis.clearTimeout;
// A change of what an element is that is no change of the DOM, like a
// stylesheet that loads or a layout that settles, is seen this late.
const pollInterval = 50;

/** What a look found, or `undefined` for nothing yet. */
export type Look<T> = () => { value: T } | undefined;

/**
 * What `look` finds, once it finds something. It looks at once, then again
 * after each batch of changes of the DOM: one MutationObserver for the whole
 * wait, and the records of one microtask checkpoint, however many callbacks
 * they make, are one look. And every 50 ms besides. Rejects with what `look`
 * throws, and with `timedOut()` after `timeout` milliseconds, at once for 0.
 */
export function waitUntil<T>(look: Look<T>, timeout: number, timedOut: () => unknown): Promise<T> {
  let now: { value: T } | undefined;
  try {
    now = look();
  } catch (error) {
    return Promise.reject(error);
  }
  if (now) return Promise.resolve(now.value);
  if (!(timeout > 0)) return Promise.reject(timedOut());
  return new Promise<T>((resolve, reject) => {
    let scheduled = false;
    let settled = false;
    const done = () => {
      settled = true;
      observer.disconnect();
      clearTimeout(poll);
      clearTimeout(deadline);
    };
    const again = () => {
      scheduled = false;
      if (settled) return;
      try {
        const found = look();
        if (!found) return;
        done();
        resolve(found.value);
      } catch (error) {
        done();
        reject(error);
      }
    };
    const observer = new MutationObserver(() => {
      if (scheduled) return;
      scheduled = true;
      queueMicrotask(again);
    });
    observer.observe(document, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    });
    let poll = setTimeout(function repeat() {
      again();
      if (!settled) poll = setTimeout(repeat, pollInterval);
    }, pollInterval);
    const deadline = setTimeout(() => {
      done();
      reject(timedOut());
    }, timeout);
  });
}
