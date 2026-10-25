// @vitest-environment happy-dom
import { afterEach, expect, test } from "vitest";
import { createNavigation } from "./navigation-shim.ts";
import type { NavigateEvent } from "./nextjs/host-document.ts";

// A document that loads no other one, as the plugin has happy-dom's.
const navigation = createNavigation(window);
const heard: NavigateEvent[] = [];
let stop = false;
navigation.addEventListener("navigate", (event) => {
  heard.push(event as NavigateEvent);
  if (stop) event.preventDefault();
});

afterEach(() => {
  heard.length = 0;
  stop = false;
  document.body.replaceChildren();
});

const destinations = () => heard.map(({ destination }) => destination);

test("a click on a link, unless the app took it", () => {
  document.body.innerHTML = `<a href="/notes">Notes</a><a href="/taken">Taken</a>`;
  const [notes, taken] = document.querySelectorAll("a");
  taken!.addEventListener("click", (event) => event.preventDefault());
  notes!.click();
  taken!.click();
  expect(destinations()).toEqual([{ url: `${location.origin}/notes`, sameDocument: false }]);
  expect(heard[0]).toMatchObject({ navigationType: "push", formData: null, cancelable: true });
});

test("stopping it stops the click, as the browser's default action", () => {
  document.body.innerHTML = `<a href="/notes">Notes</a>`;
  stop = true;
  const click = new MouseEvent("click", { bubbles: true, cancelable: true });
  document.querySelector("a")!.dispatchEvent(click);
  expect(click.defaultPrevented).toBe(true);
});

test("a post of a form, with the button that submits it", () => {
  document.body.innerHTML = `
    <form method="post" action="/notes/new">
      <input name="title" value="A note" />
      <button name="intent" value="save">Save</button>
    </form>`;
  document.querySelector("button")!.click();
  expect(destinations()).toEqual([{ url: `${location.origin}/notes/new`, sameDocument: false }]);
  expect([...heard[0]!.formData!]).toEqual([
    ["title", "A note"],
    ["intent", "save"],
  ]);
});

test("a get of a form, with its fields in the URL", () => {
  document.body.innerHTML = `<form action="/search"><input name="q" value="pglite" /></form>`;
  document.querySelector("form")!.requestSubmit();
  expect(destinations()).toEqual([
    { url: `${location.origin}/search?q=pglite`, sameDocument: false },
  ]);
  expect(heard[0]!.formData).toBeNull();
});

test("location, which keeps the document where nothing takes it", () => {
  const before = location.href;
  location.assign("/a");
  location.href = "/b";
  location.replace("/c");
  location.reload();
  expect(heard.map(({ navigationType }) => navigationType)).toEqual([
    "push",
    "push",
    "replace",
    "reload",
  ]);
  expect(destinations().map(({ url }) => new URL(url).pathname)).toEqual([
    "/a",
    "/b",
    "/c",
    new URL(before).pathname,
  ]);
  expect(location.href).toBe(before);
});

test("a change of the hash is the DOM's", () => {
  const before = location.href;
  location.assign("#notes");
  expect(destinations()).toEqual([{ url: `${before.split("#")[0]}#notes`, sameDocument: true }]);
  expect(location.hash).toBe("#notes");
  history.replaceState(null, "", before);
});

test("history, in the same document", () => {
  const before = location.href;
  history.pushState(null, "", "/pushed");
  expect(destinations()).toEqual([{ url: `${location.origin}/pushed`, sameDocument: true }]);
  expect(heard[0]!.cancelable).toBe(false);
  expect(location.pathname).toBe("/pushed");
  history.replaceState(null, "", before);
});
