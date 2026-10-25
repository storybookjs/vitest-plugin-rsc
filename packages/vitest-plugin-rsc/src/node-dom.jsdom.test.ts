// @vitest-environment jsdom
import { expect, onTestFinished, test } from "vitest";
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

test("a stylesheet and its preload load once, which jsdom never answers itself", async () => {
  const events: string[] = [];
  const links = [
    { rel: "preload", as: "style", href: "/a.css" },
    { rel: "stylesheet", href: "/a.css" },
  ].map((attributes) => {
    const link = document.createElement("link");
    for (const [name, value] of Object.entries(attributes)) link.setAttribute(name, value);
    link.addEventListener("load", () => events.push(`load ${link.rel}`));
    link.addEventListener("error", () => events.push(`error ${link.rel}`));
    return link;
  });
  onTestFinished(() => links.forEach((link) => link.remove()));
  document.head.append(...links);
  await new Promise((resolve) => setTimeout(resolve, 10));
  expect(events).toEqual(["load preload", "load stylesheet"]);
});
