// @vitest-environment happy-dom
import { expect, onTestFinished, test, vi } from "vitest";
import "./node-dom.ts";

// What the Node host gives happy-dom of a browser's DOM that happy-dom has not.

const { settings } = (window as unknown as { happyDOM: { settings: Record<string, unknown> } })
  .happyDOM;

// A link of the `<head>`, with the events it gets, until it leaves the test.
function linkOf(attributes: Record<string, string>) {
  const link = document.createElement("link");
  const events: string[] = [];
  for (const type of ["load", "error"]) link.addEventListener(type, () => events.push(type));
  for (const [name, value] of Object.entries(attributes)) link.setAttribute(name, value);
  onTestFinished(() => link.remove());
  return { link, events };
}
// A task after those of the links put in before it.
const nextTask = () => new Promise((resolve) => setTimeout(resolve, 10));

test("a preload of a stylesheet loads once, which happy-dom never answers itself", async () => {
  const { link, events } = linkOf({ rel: "preload", as: "style", href: "/a.css" });
  document.head.append(link);
  link.remove();
  document.head.append(link);
  await nextTask();
  expect(events).toEqual(["load"]);
});

test("a stylesheet loads once: happy-dom answers it itself, as the plugin sets it to", async () => {
  settings.handleDisabledFileLoadingAsSuccess = true;
  onTestFinished(() => void (settings.handleDisabledFileLoadingAsSuccess = false));
  const { link, events } = linkOf({ rel: "stylesheet", href: "/b.css" });
  document.head.append(link);
  await nextTask();
  expect(events).toEqual(["load"]);
});

test("a preload of a stylesheet loads also under a test's fake timers", async () => {
  vi.useFakeTimers();
  onTestFinished(() => void vi.useRealTimers());
  const { link } = linkOf({ rel: "preload", as: "style", href: "/c.css" });
  const loaded = new Promise((resolve) => link.addEventListener("load", resolve));
  document.head.append(link);
  await loaded;
});

test("a link that left the document before its task gets no answer", async () => {
  const { link, events } = linkOf({ rel: "preload", as: "style", href: "/d.css" });
  document.head.append(link);
  link.remove();
  await nextTask();
  expect(events).toEqual([]);
});

test("a preload of anything else gets no answer", async () => {
  const { link, events } = linkOf({ rel: "preload", as: "font", href: "/e.woff2" });
  document.head.append(link);
  await nextTask();
  expect(events).toEqual([]);
});
