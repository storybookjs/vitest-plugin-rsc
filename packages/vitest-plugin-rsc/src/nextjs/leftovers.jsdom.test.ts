// @vitest-environment jsdom
import { expect, test } from "vitest";
import { recordListeners } from "./leftovers.ts";

// The recorder of a page's listeners on `window` in a worker of Node.js,
// where `window` is Vitest's global, whose `addEventListener` is an accessor
// that keeps what is set in a closure of its own.

test("each page records on the window's own method, and leaves no listener and no recorder behind", () => {
  const before = window.addEventListener;
  const heard: number[] = [];
  for (let page = 0; page < 5; page++) {
    const leftovers = recordListeners(window);
    window.addEventListener("ping", () => heard.push(page));
    leftovers.stop();
    expect(window.addEventListener).toBe(before);
    window.dispatchEvent(new Event("ping"));
    leftovers.remove();
  }
  expect(heard).toEqual([0, 1, 2, 3, 4]);
  window.dispatchEvent(new Event("ping"));
  expect(heard).toEqual([0, 1, 2, 3, 4]);
});
