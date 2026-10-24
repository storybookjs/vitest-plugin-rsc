// The fidelity test: the log of React's handlers and of the native events on
// a fixture, for each action of the package and for Vitest's own (Playwright
// over CDP, the browser's trusted events), step by step. A difference that
// is not in `expectedDifferences` fails, and every one there is in the
// README's table of events.

import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, beforeAll, expect, test } from "vitest";
import { page as vitestPage, userEvent } from "vitest/browser";
import { page } from "../src/index.ts";
import { Fixture, log, nativeEntry, nativeEvents } from "./fidelity-fixture.tsx";

// oxlint-disable-next-line typescript/no-explicit-any
type AnyPage = any;
type Driver = { page: AnyPage; press(locator: AnyPage, key: string): Promise<void> };

const vitest: Driver = {
  page: vitestPage,
  // Vitest's locators press no key: Playwright's keyboard, on the focused element.
  press: (_locator, key) => userEvent.keyboard(key === " " ? " " : `{${key}}`),
};
const ours: Driver = { page, press: (locator, key) => locator.press(key) };

let root: Root;
let container: HTMLElement;
const record = (event: Event) => log.push(nativeEntry(event));

beforeAll(() => {
  const neutral = document.createElement("div");
  neutral.dataset.testid = "neutral";
  neutral.style.cssText = "position: fixed; right: 0; bottom: 0; width: 20px; height: 20px";
  document.body.append(neutral);
  for (const type of nativeEvents) document.addEventListener(type, record, true);
});
afterAll(() => {
  for (const type of nativeEvents) document.removeEventListener(type, record, true);
});

function render() {
  root?.unmount();
  container?.remove();
  container = document.createElement("div");
  container.id = "root";
  document.body.prepend(container);
  root = createRoot(container);
  flushSync(() => root.render(<Fixture />));
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 30));

interface Step {
  name: string;
  /** What comes before the step, unlogged. */
  before?(driver: Driver): Promise<void>;
  run(driver: Driver): Promise<void>;
}

const steps: Step[] = [
  { name: "click a button", run: ({ page }) => page.getByRole("button", { name: "Save" }).click() },
  {
    name: "click another button",
    before: ({ page }) => page.getByRole("button", { name: "Save" }).click(),
    run: ({ page }) => page.getByRole("button", { name: "Other" }).click(),
  },
  {
    name: "click the same button again",
    before: ({ page }) => page.getByRole("button", { name: "Save" }).click(),
    run: ({ page }) => page.getByRole("button", { name: "Save" }).click(),
  },
  { name: "hover a link", run: ({ page }) => page.getByRole("link", { name: "Go" }).hover() },
  {
    name: "unhover",
    before: ({ page }) => page.getByRole("link", { name: "Go" }).hover(),
    run: ({ page }) => page.getByRole("link", { name: "Go" }).unhover(),
  },
  { name: "click a link", run: ({ page }) => page.getByRole("link", { name: "Go" }).click() },
  {
    name: "double-click",
    run: ({ page }) => page.getByRole("button", { name: "Other" }).dblClick(),
  },
  {
    name: "fill a controlled input",
    run: ({ page }) => page.getByLabelText("Text").fill("new value"),
  },
  {
    name: "fill it again, focused",
    before: ({ page }) => page.getByLabelText("Text").fill("abc"),
    run: ({ page }) => page.getByLabelText("Text").fill("abcd"),
  },
  { name: "fill with nothing", run: ({ page }) => page.getByLabelText("Text").fill("") },
  {
    name: "change on blur",
    before: ({ page }) => page.getByLabelText("Text").fill("typed"),
    run: ({ page }) => page.getByRole("button", { name: "Other" }).click(),
  },
  { name: "fill a textarea", run: ({ page }) => page.getByLabelText("Notes").fill("line") },
  {
    name: "clear a textarea",
    before: ({ page }) => page.getByLabelText("Notes").fill("line"),
    run: ({ page }) => page.getByLabelText("Notes").clear(),
  },
  { name: "click a label", run: ({ page }) => page.getByText("Agree").click() },
  { name: "click a checkbox", run: ({ page }) => page.getByRole("checkbox").click() },
  {
    name: "select an option",
    run: ({ page }) => page.getByLabelText("Fruit").selectOptions("Pear"),
  },
  {
    name: "Enter in a form's input",
    before: async ({ page }) => {
      await page.getByLabelText("Name").fill("Ada");
    },
    run: (driver) => driver.press(driver.page.getByLabelText("Name"), "Enter"),
  },
  {
    name: "a printable key",
    before: ({ page }) => page.getByLabelText("Name").click(),
    run: (driver) => driver.press(driver.page.getByLabelText("Name"), "x"),
  },
  {
    name: "Backspace",
    before: async (driver) => {
      await driver.page.getByLabelText("Name").fill("Ada");
    },
    run: (driver) => driver.press(driver.page.getByLabelText("Name"), "Backspace"),
  },
  {
    name: "Tab",
    before: ({ page }) => page.getByLabelText("Name").click(),
    run: (driver) => driver.press(driver.page.getByLabelText("Name"), "Tab"),
  },
  {
    name: "Space on a button",
    before: ({ page }) => page.getByRole("button", { name: "Send" }).click(),
    run: (driver) => driver.press(driver.page.getByRole("button", { name: "Send" }), " "),
  },
  {
    name: "Enter on a button",
    before: ({ page }) => page.getByRole("button", { name: "Other" }).click(),
    run: (driver) => driver.press(driver.page.getByRole("button", { name: "Other" }), "Enter"),
  },
  {
    name: "click a submit button",
    before: ({ page }) => page.getByLabelText("Name").fill("Grace"),
    run: ({ page }) => page.getByRole("button", { name: "Send" }).click(),
  },
  {
    name: "Space on a checkbox",
    before: ({ page }) => page.getByRole("checkbox").click(),
    run: (driver) => driver.press(driver.page.getByRole("checkbox"), " "),
  },
  {
    name: "Enter on a link",
    before: ({ page }) => page.getByRole("link", { name: "Go" }).hover(),
    run: async (driver) => {
      await driver.page.getByRole("link", { name: "Go" }).element().focus();
      await driver.press(driver.page.getByRole("link", { name: "Go" }), "Enter");
    },
  },
  {
    name: "Escape",
    before: ({ page }) => page.getByRole("button", { name: "Other" }).click(),
    run: (driver) => driver.press(driver.page.getByRole("button", { name: "Other" }), "Escape"),
  },
];

async function logOf(step: Step, driver: Driver): Promise<string[]> {
  render();
  // Both mice off the fixture: Playwright's, and the package's.
  await vitestPage.getByTestId("neutral").hover();
  await page.getByTestId("neutral").hover();
  await step.before?.(driver);
  await settle();
  log.length = 0;
  await step.run(driver);
  await settle();
  return [...log];
}

/**
 * What the package does otherwise than Playwright, by step: the entries of
 * Playwright's log it has not (`- entry`) and the ones it has that
 * Playwright's has not (`+ entry`). The README's table of events says why.
 */
const expectedDifferences: Record<string, string[]> = {};

// Entries whose place in the log is the browser's: `select()` queues its
// `select` event as a task, which runs before Playwright's typing or after
// it, as the round trip of CDP takes, and after the package's, which types
// at once. React's `onSelect` follows the selection. They are in both logs,
// anywhere.
const unordered = (entry: string) => /^(select|react:onSelect)@/.test(entry);

test.each(steps)("$name: the log of the package's action is Playwright's", async (step) => {
  const theirs = await logOf(step, vitest);
  const our = await logOf(step, ours);
  const missing = theirs.filter((entry) => !our.includes(entry)).map((entry) => `- ${entry}`);
  const extra = our.filter((entry) => !theirs.includes(entry)).map((entry) => `+ ${entry}`);
  const differences = [...missing, ...extra];
  const ordered = (entries: string[], other: string[]) =>
    entries.filter((entry) => other.includes(entry) && !unordered(entry));
  const sameOrder = JSON.stringify(ordered(theirs, our)) === JSON.stringify(ordered(our, theirs));
  expect(theirs.length).toBeGreaterThan(0);
  expect(
    { differences, sameOrder },
    `Playwright:\n${theirs.join("\n")}\n\ndom-locators:\n${our.join("\n")}`,
  ).toEqual({ differences: expectedDifferences[step.name] ?? [], sameOrder: true });
});
