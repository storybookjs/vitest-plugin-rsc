// The oracle table: each locator of the table, on each fixture, finds the
// elements that Vitest's own `page` finds, in the same order, and has the
// selector and the printed locator Vitest has for it. Or it throws the error
// Vitest's throws. The oracle is the engine whose semantics the package
// claims: Playwright's, as `vitest/browser` runs it in the page.

import { expect, test } from "vitest";
import { page as vitestPage } from "vitest/browser";
import { page } from "../src/index.ts";
import { ariaFixture, notesFixtures } from "./fixtures.ts";
import { answer, notesRows, rows, type Row } from "./oracle-table.ts";

function compare(fixture: string, extraRows: Row[]): { compared: number; mismatches: string[] } {
  // Parsed with its shadow roots, of `<template shadowrootmode>`.
  document.body.setHTMLUnsafe(fixture);
  const mismatches: string[] = [];
  for (const [name, build] of [...rows, ...extraRows]) {
    const ours = answer(build, page);
    const theirs = answer(build, vitestPage);
    if (JSON.stringify(ours) !== JSON.stringify(theirs)) {
      mismatches.push(
        `${name}:\n  ours   ${JSON.stringify(ours)}\n  Vitest ${JSON.stringify(theirs)}`,
      );
      continue;
    }
    if ("error" in ours) continue;
    const our = build(page);
    const their = build(vitestPage);
    if (our.selector !== their.selector) {
      mismatches.push(`${name}: selector\n  ours   ${our.selector}\n  Vitest ${their.selector}`);
    }
    if (our.asLocator() !== their.asLocator()) {
      mismatches.push(
        `${name}: asLocator\n  ours   ${our.asLocator()}\n  Vitest ${their.asLocator()}`,
      );
    }
  }
  return { compared: rows.length + extraRows.length, mismatches };
}

test("every locator of the table finds what Vitest's page finds, on the ARIA page", () => {
  const { compared, mismatches } = compare(ariaFixture, []);
  expect(mismatches.join("\n")).toBe("");
  expect(compared).toBeGreaterThan(400);
});

test("every locator of the benchmark finds what Vitest's page finds, on each route of the notes app", () => {
  const results = Object.entries(notesFixtures).map(([route, html]) => {
    const { compared, mismatches } = compare(html, notesRows);
    return { route, compared, mismatches };
  });
  expect(
    results.flatMap(({ route, mismatches }) => mismatches.map((m) => `${route}: ${m}`)).join("\n"),
  ).toBe("");
});

test("a locator of an element finds what Vitest's finds, and the getBy* in it", () => {
  document.body.setHTMLUnsafe(ariaFixture);
  const nav = document.getElementById("nav-primary")!;
  const pairs: Row[] = [
    ["elementLocator", (p) => p.elementLocator(nav)],
    ["elementLocator > link", (p) => p.elementLocator(nav).getByRole("link")],
    ["elementLocator > text", (p) => p.elementLocator(nav).getByText("home")],
    ["elementLocator of html", (p) => p.elementLocator(document.documentElement).getByRole("main")],
    ["all", (p) => p.getByRole("listitem").all()[1].getByRole("link")],
  ];
  for (const [name, build] of pairs) {
    expect(answer(build, page), name).toEqual(answer(build, vitestPage));
  }
});
