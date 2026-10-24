// The cost of a query and of an action, in microseconds, on a page of the
// notes app with 20 notes: the package's, and Vitest's own in the same run.
// A runner's speed is its own, so the test holds the package's to a share of
// Vitest's, and prints both; the budgets of the README, a link by its name
// in 60 µs and a click in 100 µs, are for a developer's machine.

import { expect, test } from "vitest";
import { page as vitestPage } from "vitest/browser";
import { page } from "../src/index.ts";

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
  "a link by its name, and a click, at half of Vitest's or less",
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
    expect(ours.linkByName).toBeLessThanOrEqual(vitest.linkByName * 0.5);
    expect(ours.click).toBeLessThanOrEqual(vitest.click * 0.5);
  },
);
