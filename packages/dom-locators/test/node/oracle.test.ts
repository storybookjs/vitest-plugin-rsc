// The oracle table in a DOM of Node.js, happy-dom's or jsdom's: each locator
// finds the elements that ivya finds, the engine Vitest's locators run, in
// the same DOM, for the selector the browser's oracle holds to Vitest's.
// Where a DOM of Node.js answers otherwise than Chromium, both do alike: no
// layout, no pseudo-elements, no declarative shadow roots in jsdom.

import { Ivya } from "ivya";
import { expect, test } from "vitest";
import { page } from "../../src/index.ts";
import { ariaFixture, notesFixtures } from "../fixtures.ts";
import { answer, notesRows, rows, type Build, type Row } from "../oracle-table.ts";

// The browser the package takes a DOM of Node.js for, by its user agent: WebKit.
const ivya = Ivya.create({ browser: "webkit", exact: true, testIdAttribute: "data-testid" });
const byIvya =
  (build: Build): Build =>
  (p) => ({
    elements: () =>
      withRenderlessStyles(() =>
        ivya.queryLocatorSelectorAll(build(p).selector, document.documentElement),
      ),
  });

/**
 * Runs `run` with the package's two rules for a DOM that does not render,
 * which ivya has not: a style without a visibility is visible, and there
 * are no styles of pseudo-elements. happy-dom computes no visibility, so
 * ivya would find no element there at all; jsdom warns of every style of a
 * pseudo-element it is asked for, and has none.
 */
function withRenderlessStyles<T>(run: () => T): T {
  const view = document.defaultView!;
  const getComputedStyle = view.getComputedStyle;
  view.getComputedStyle = (element, pseudo) => {
    if (pseudo) return undefined as unknown as CSSStyleDeclaration;
    const style = getComputedStyle.call(view, element, pseudo);
    if (style.visibility !== "") return style;
    return new Proxy(style, {
      get(target, key) {
        if (key === "visibility") return "visible";
        const value = Reflect.get(target, key, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
  };
  try {
    return run();
  } finally {
    view.getComputedStyle = getComputedStyle;
  }
}

/** The mismatches with ivya, and how many locators found an element: a DOM that hid every element would agree with ivya too. */
function compare(fixture: string, table: Row[]): { mismatches: string[]; found: number } {
  const body = document.body as HTMLElement & { setHTMLUnsafe?(html: string): void };
  if (body.setHTMLUnsafe) body.setHTMLUnsafe(fixture);
  else body.innerHTML = fixture;
  const mismatches: string[] = [];
  let found = 0;
  for (const [name, build] of table) {
    const ours = answer(build, page);
    const theirs = answer(byIvya(build), page);
    if ("elements" in ours && ours.elements.length) found++;
    if (JSON.stringify(ours) !== JSON.stringify(theirs)) {
      mismatches.push(`${name}:\n  ours ${JSON.stringify(ours)}\n  ivya ${JSON.stringify(theirs)}`);
    }
  }
  return { mismatches, found };
}

// jsdom takes seconds for the table, ivya's answers and the package's.
test(
  "every locator of the table finds what ivya finds, on the ARIA page",
  { timeout: 60_000 },
  () => {
    const { mismatches, found } = compare(ariaFixture, rows);
    expect(mismatches.join("\n")).toBe("");
    expect(found).toBeGreaterThan(rows.length / 3);
  },
);

test(
  "every locator of the benchmark finds what ivya finds, on each route of the notes app",
  {
    timeout: 60_000,
  },
  () => {
    const results = Object.entries(notesFixtures).map(([route, html]) => ({
      route,
      ...compare(html, [...rows, ...notesRows]),
    }));
    expect(
      results
        .flatMap(({ route, mismatches }) => mismatches.map((m) => `${route}: ${m}`))
        .join("\n"),
    ).toBe("");
    for (const { route, found } of results) expect(found, route).toBeGreaterThan(10);
  },
);
