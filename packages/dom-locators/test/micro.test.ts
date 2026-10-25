// The cost of a query and of an action, in microseconds, on a page of the
// notes app with 20 notes: the package's, and Vitest's own in the same run.
// A runner's speed is its own, and so is the share of a CDP round trip in
// Vitest's, so the test holds the package's to no more than Vitest's, and
// prints both: the numbers are the benchmark's, `bench/` of the notes app.
// The README has the numbers of a developer's machine.

import { expect, test } from "vitest";
import { page as vitestPage } from "vitest/browser";
import { isVisible } from "../src/actionability.ts";
import { page } from "../src/index.ts";
import { click, hover } from "../src/pointer.ts";
import {
  beginAriaCaches,
  endAriaCaches,
  getAriaDisabled,
  isElementHiddenForAria,
} from "../src/role-utils.ts";

const notes = Array.from({ length: 20 }, (_, i) => `Note ${String(i + 1).padStart(2, "0")}`);

function render() {
  document.body.innerHTML = `
    <header><nav aria-label="Main"><a href="/notes">Notes</a> <a href="/profile">Profile</a>
      <span>Signed in as Ada Lovelace</span><form><button type="submit">Sign out</button></form></nav></header>
    <main>
      <h1>Notes</h1><p>20 notes</p>
      <form><label for="q">Search</label><input id="q" type="search"><button type="button">Search</button></form>
      <a href="/notes/new">New note</a>
      <ul aria-label="Notes">${notes.map((note, i) => `<li><a href="/notes/${i}">${note}</a>${i % 3 ? "" : "<span> ★ Favorite</span>"}</li>`).join("")}</ul>
      <button type="button" id="count">Clicked 0</button>
    </main>`;
  let count = 0;
  const button = document.getElementById("count")!;
  button.addEventListener("click", () => (button.textContent = `Clicked ${++count}`));
}

/**
 * The median of `batches` timings of `run`, in microseconds a run: a batch
 * is `size` runs, as the page's clock has a grain of 100 µs.
 */
async function median(batches: number, run: () => unknown, size = 50): Promise<number> {
  for (let i = 0; i < size; i++) await run();
  const times: number[] = [];
  for (let b = 0; b < batches; b++) {
    const start = performance.now();
    for (let i = 0; i < size; i++) await run();
    times.push(((performance.now() - start) * 1000) / size);
  }
  times.sort((a, b) => a - b);
  return Math.round(times[Math.floor(times.length / 2)]!);
}

// Vitest's clicks take milliseconds each.
test(
  "a link by its name, and a click, no slower than Vitest's own",
  { timeout: 60_000 },
  async () => {
    render();
    const link = (p: typeof page | typeof vitestPage) =>
      p.getByRole("link", { name: "Note 07", exact: true });
    const ours = {
      linkByName: await median(20, () => link(page).elements()),
      labelText: await median(20, () => page.getByLabelText("Search").elements()),
      text: await median(20, () => page.getByText("20 notes").elements()),
      click: await median(20, () => page.getByRole("button", { name: /^Clicked/ }).click()),
      fill: await median(20, () => page.getByLabelText("Search").fill("note")),
    };
    const vitest = {
      linkByName: await median(20, () => link(vitestPage).elements()),
      click: await median(3, () => vitestPage.getByRole("button", { name: /^Clicked/ }).click(), 3),
    };
    console.log(JSON.stringify({ ours, vitest }));
    expect(ours.linkByName).toBeLessThanOrEqual(vitest.linkByName);
    expect(ours.click).toBeLessThanOrEqual(vitest.click);
  },
);

// Where a click and a fill spend their time, by step, each on a clean page
// and on one with a change of the DOM before it, as a React render leaves
// it: the style and the layout that the step recomputes are in the second.
// `change` alone is the cost of the change, to subtract.
test("where a click and a fill spend their time", { timeout: 60_000 }, async () => {
  render();
  const stamp = document.querySelector("main > p")!;
  let n = 0;
  const change = () => (stamp.textContent = `${++n} notes`);
  const button = page.getByRole("button", { name: /^Clicked/ });
  const element = button.element();
  const links = [...document.querySelectorAll("a")];
  const steps: Record<string, () => unknown> = {
    "query: every element": () => {
      for (const element of document.documentElement.querySelectorAll("*")) void element.shadowRoot;
    },
    "query: getByRole('link')": () => page.getByRole("link").elements(),
    "query: getByRole('link', { name })": () =>
      page.getByRole("link", { name: "Note 07", exact: true }).elements(),
    "query: getByRole('button', { name: RegExp })": () => button.elements(),
    "query: ::before and ::after of every link": () => {
      for (const link of links) {
        void getComputedStyle(link, "::before").content;
        void getComputedStyle(link, "::after").content;
      }
    },
    "check: visible": () => isVisible(element),
    "check: hidden for ARIA": () => {
      beginAriaCaches();
      isElementHiddenForAria(element);
      endAriaCaches();
    },
    "check: disabled": () => getAriaDisabled(element),
    "events: a click() of the element": () => click(element),
    "events: a hover() of the element": () => hover(element),
    "events: a click event": () =>
      element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })),
    "action: click()": () => button.click(),
    "action: fill()": () => page.getByLabelText("Search").fill(`note ${n}`),
  };
  const clean: Record<string, number> = {};
  const changed: Record<string, number> = { change: await median(20, change) };
  for (const [name, run] of Object.entries(steps)) {
    clean[name] = await median(20, run);
    changed[name] = await median(20, () => {
      change();
      return run();
    });
  }
  console.log(JSON.stringify({ breakdown: { clean, changed } }));
});
