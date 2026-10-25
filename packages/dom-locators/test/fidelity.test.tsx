// The fidelity test: the log of React's handlers and of the native events on
// a fixture, for each action of the package and for Vitest's own (Playwright
// over CDP, the browser's trusted events), step by step. A difference that
// is not in `expectedDifferences` fails, and every one there is in the
// README's table of events. Playwright's logs are recorded in
// playwright-logs.json, for the same steps in a DOM of Node.js, and the last
// test holds the recording to them.

import { afterAll, beforeAll, expect, test } from "vitest";
import { page as vitestPage, userEvent } from "vitest/browser";
import { page } from "../src/index.ts";
import {
  compareLogs,
  logOf,
  setUpStage,
  steps,
  unordered,
  type Driver,
} from "./fidelity-steps.tsx";
import playwrightLogs from "./playwright-logs.json" with { type: "json" };

/** A combination of `press()`, like "Shift+Tab", in the syntax of `userEvent.keyboard()`. */
function keyboardSyntax(combination: string): string {
  const keys = combination.split(/\+(?!$)/);
  const key = keys.pop()!;
  const name = (key: string) => (key === " " ? " " : `{${key}}`);
  return `${keys.map((m) => `{${m}>}`).join("")}${name(key)}${keys
    .reverse()
    .map((m) => `{/${m}}`)
    .join("")}`;
}

const vitest: Driver = {
  page: vitestPage,
  // Vitest's locators press no key: Playwright's keyboard, on the focused element.
  press: (_locator, key) => userEvent.keyboard(keyboardSyntax(key)),
  type: (locator, text) => userEvent.type(locator, text),
};
const ours: Driver = {
  page,
  press: (locator, key) => locator.press(key),
  type: (locator, text) => locator.pressSequentially(text),
};

// Both mice off the fixture: Playwright's, and the package's.
const rest = async () => {
  await vitestPage.getByTestId("neutral").hover();
  await page.getByTestId("neutral").hover();
};

let tearDown: () => void;
beforeAll(() => {
  tearDown = setUpStage();
});
afterAll(() => tearDown());

/**
 * What the package does otherwise than Playwright, by step: the entries of
 * Playwright's log it has not (`- entry`) and the ones it has that
 * Playwright's has not (`+ entry`). The README's table of events says why.
 */
const expectedDifferences: Record<string, string[]> = {};

// Playwright's log of each step, in a DOM of Node.js the oracle.
const recorded: Record<string, string[]> = {};

test.each(steps)("$name: the log of the package's action is Playwright's", async (step) => {
  const theirs = await logOf(step, vitest, rest);
  recorded[step.name] = theirs;
  const our = await logOf(step, ours, rest);
  expect(theirs.length).toBeGreaterThan(0);
  expect(
    compareLogs(theirs, our),
    `Playwright:\n${theirs.join("\n")}\n\ndom-locators:\n${our.join("\n")}`,
  ).toEqual({ differences: expectedDifferences[step.name] ?? [], sameOrder: true });
});

test("Playwright's logs are the ones recorded in playwright-logs.json", () => {
  expect(Object.keys(recorded)).toHaveLength(steps.length);
  // The entries whose place is the browser's, sorted, as their place is no answer.
  const sorted = (logs: Record<string, string[]>) =>
    Object.fromEntries(
      Object.entries(logs).map(([name, entries]) => [
        name,
        [...entries.filter((entry) => !unordered(entry)), ...entries.filter(unordered).sort()],
      ]),
    );
  const current = sorted(recorded);
  if (JSON.stringify(current) !== JSON.stringify(sorted(playwrightLogs))) {
    // What to write to playwright-logs.json, from the log of a run.
    console.log(`playwright-logs.json ${JSON.stringify(current)}`);
  }
  expect(current).toEqual(sorted(playwrightLogs));
});
