// @vitest-environment jsdom
import { expect, test } from "vitest";
import "./node-dom.ts";

// What the Node host gives jsdom of a browser's DOM that jsdom has not.

test("media queries, of which none matches, as a library asks as it renders", () => {
  const dark = window.matchMedia("(prefers-color-scheme: dark)");
  expect(dark).toMatchObject({ media: "(prefers-color-scheme: dark)", matches: false });
  const heard: unknown[] = [];
  dark.addEventListener("change", (event) => heard.push(event));
  dark.addListener(() => heard.push("old"));
  expect(heard).toEqual([]);
});

test("the boxes of a range: none", () => {
  const range = document.createRange();
  expect(Array.from(range.getClientRects())).toEqual([]);
  expect(range.getBoundingClientRect().width).toBe(0);
});
