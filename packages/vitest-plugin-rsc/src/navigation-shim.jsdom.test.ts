// @vitest-environment jsdom
import { expect, test } from "vitest";
import { createNavigation } from "./navigation-shim.ts";
import type { NavigateEvent } from "./nextjs/host-document.ts";

// jsdom's `location`, as a browser's, has members of its own that nothing
// can redefine: the shim leaves them, and hears the rest.
const navigation = createNavigation(window);
const heard: NavigateEvent[] = [];
navigation.addEventListener("navigate", (event) => heard.push(event as NavigateEvent));

test("a click on a link and history, not location", () => {
  document.body.innerHTML = `<a href="/notes">Notes</a>`;
  document.querySelector("a")!.click();
  history.pushState(null, "", "/pushed");
  expect(heard.map(({ destination }) => destination)).toEqual([
    { url: `${location.origin}/notes`, sameDocument: false },
    { url: `${location.origin}/pushed`, sameDocument: true },
  ]);
  expect(Object.getOwnPropertyDescriptor(location, "assign")?.configurable).toBe(false);
});
