// The fidelity test in a DOM of Node.js, happy-dom's or jsdom's: each step
// of the browser's, run with the package's actions, against Playwright's
// log of it in Chromium, recorded in playwright-logs.json. A difference
// that is not in `expectedDifferences` fails; each there comes of what such
// a DOM has not, which the README's section on it says.

import { afterAll, beforeAll, expect, test } from "vitest";
import { page } from "../../src/index.ts";
import { compareLogs, logOf, setUpStage, steps, type Driver } from "../fidelity-steps.tsx";
import playwrightLogs from "../playwright-logs.json" with { type: "json" };

const ours: Driver = {
  page,
  press: (locator, key) => locator.press(key),
  type: (locator, text) => locator.pressSequentially(text),
};
const rest = () => page.getByTestId("neutral").hover();

let tearDown: () => void;
beforeAll(() => {
  tearDown = setUpStage();
});
afterAll(() => tearDown());

const recorded: Record<string, string[]> = playwrightLogs;

/** What the package does otherwise in a DOM of Node.js than Playwright in Chromium, by step. */
const expectedDifferences: Record<string, string[]> = {};

test.each(steps)("$name: the log of the package's action is Playwright's", async (step) => {
  const theirs = recorded[step.name];
  expect(theirs, "Playwright's log of the step, in playwright-logs.json").toBeDefined();
  const our = await logOf(step, ours, rest);
  expect(
    compareLogs(theirs!, our),
    `Playwright:\n${theirs!.join("\n")}\n\ndom-locators:\n${our.join("\n")}`,
  ).toEqual({ differences: expectedDifferences[step.name] ?? [], sameOrder: true });
});
