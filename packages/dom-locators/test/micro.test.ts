// The cost of a query and of an action, in microseconds, on a page of the
// notes app with 20 notes: the package's, and Vitest's own for scale. The
// budgets: a link by its name in 60 µs, a click in 100 µs, with the whole
// accessible name and the mouse's way to the element.

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
 * is 50 runs, as the page's clock has a grain of 100 µs.
 */
async function median(batches: number, run: () => unknown): Promise<number> {
  const size = 50;
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

test("a link by its name, and a click, within their budgets", async () => {
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
    click: await median(3, () => vitestPage.getByRole("button", { name: /^Clicked/ }).click()),
  };
  console.log(JSON.stringify({ ours, vitest }));
  // Ten times the budgets: a regression, not the noise of a shared runner.
  expect(ours.linkByName).toBeLessThan(600);
  expect(ours.click).toBeLessThan(1000);
});
