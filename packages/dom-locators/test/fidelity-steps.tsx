// The steps of the fidelity test, and the stage they run on: the fixture
// of React's handlers and the native events, rendered again for each step,
// and the log of what a driver's step did. The browser's test runs each
// step with Playwright's actions and the package's, and records
// Playwright's logs; the test in a DOM of Node.js holds the package's to
// those.

import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { Fixture, log, nativeEntry, nativeEvents } from "./fidelity-fixture.tsx";

// oxlint-disable-next-line typescript/no-explicit-any
type AnyPage = any;

/** What runs a step: a page, and how it presses keys and types. */
export interface Driver {
  page: AnyPage;
  press(locator: AnyPage, key: string): Promise<void>;
  type(locator: AnyPage, text: string): Promise<void>;
}

// Select all: Meta+a on macOS, Control+a elsewhere.
const selectAll = /Mac/.test(navigator.platform) ? "Meta+a" : "Control+a";

export interface Step {
  name: string;
  /** What comes before the step, unlogged. */
  before?(driver: Driver): Promise<void>;
  run(driver: Driver): Promise<void>;
}

export const steps: Step[] = [
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
    name: "click with Shift held",
    run: ({ page }) => page.getByRole("button", { name: "Other" }).click({ modifiers: ["Shift"] }),
  },
  {
    name: "right-click",
    run: ({ page }) => page.getByRole("button", { name: "Other" }).click({ button: "right" }),
  },
  {
    name: "middle-click",
    run: ({ page }) => page.getByRole("button", { name: "Other" }).click({ button: "middle" }),
  },
  {
    name: "triple-click",
    run: ({ page }) => page.getByRole("button", { name: "Other" }).tripleClick(),
  },
  {
    name: "click at a position",
    run: ({ page }) =>
      page.getByRole("button", { name: "Save" }).click({ position: { x: 1, y: 1 } }),
  },
  {
    name: "hover with Control held",
    run: ({ page }) => page.getByRole("link", { name: "Go" }).hover({ modifiers: ["Control"] }),
  },
  {
    name: "drag a button onto another",
    run: ({ page }) =>
      page
        .getByRole("button", { name: "Save" })
        .dropTo(page.getByRole("button", { name: "Other" })),
  },
  {
    name: "upload files",
    run: ({ page }) =>
      page
        .getByLabelText("File")
        .upload([
          new File(["a"], "a.txt", { type: "text/plain" }),
          new File(["b"], "b.txt", { type: "text/plain" }),
        ]),
  },
  {
    name: "wheel over a box that scrolls",
    run: ({ page }) => page.getByText("Scroll me").wheel({ delta: { y: 30 } }),
  },
  {
    name: "Shift+Tab",
    before: ({ page }) => page.getByLabelText("Name").click(),
    run: (driver) => driver.press(driver.page.getByLabelText("Name"), "Shift+Tab"),
  },
  {
    name: "select all in an input",
    before: ({ page }) => page.getByLabelText("Name").fill("Ada"),
    run: (driver) => driver.press(driver.page.getByLabelText("Name"), selectAll),
  },
  {
    name: "a letter with Shift, and Shift alone",
    before: ({ page }) => page.getByLabelText("Name").click(),
    run: async (driver) => {
      await driver.press(driver.page.getByLabelText("Name"), "Shift+a");
      await driver.press(driver.page.getByLabelText("Name"), "Shift");
    },
  },
  {
    name: "the caret: arrows, Home and End, with Shift",
    before: ({ page }) => page.getByLabelText("Text").fill("abc"),
    run: async (driver) => {
      const text = driver.page.getByLabelText("Text");
      for (const key of ["ArrowLeft", "x", "Home", "y", "Shift+ArrowRight", "z", "End", "w"]) {
        await driver.press(text, key);
      }
    },
  },
  {
    name: "type a text",
    run: (driver) => driver.type(driver.page.getByLabelText("Notes"), "hi you"),
  },
  {
    name: "click where pointerdown is cancelled",
    run: ({ page }) => page.getByRole("button", { name: "Hold" }).click(),
  },
  {
    name: "force-click a button",
    run: ({ page }) => page.getByRole("button", { name: "Other" }).click({ force: true }),
  },
  {
    name: "a key in a read-only input",
    run: (driver) => driver.press(driver.page.getByLabelText("Locked"), "x"),
  },
  {
    name: "digits into a number input",
    run: (driver) => driver.type(driver.page.getByLabelText("Amount"), "12"),
  },
  {
    name: "a shortcut on a button",
    before: ({ page }) => page.getByRole("button", { name: "Other" }).click(),
    run: (driver) => driver.press(driver.page.getByRole("button", { name: "Other" }), "Control+k"),
  },
  {
    name: "Escape",
    before: ({ page }) => page.getByRole("button", { name: "Other" }).click(),
    run: (driver) => driver.press(driver.page.getByRole("button", { name: "Other" }), "Escape"),
  },
];

let root: Root | undefined;
let container: HTMLElement | undefined;
const record = (event: Event) => log.push(nativeEntry(event));

/** Starts the log of the native events, with a spot off the fixture for the mouse to rest on. */
export function setUpStage(): () => void {
  const neutral = document.createElement("div");
  neutral.dataset.testid = "neutral";
  neutral.style.cssText = "position: fixed; right: 0; bottom: 0; width: 20px; height: 20px";
  document.body.append(neutral);
  for (const type of nativeEvents) document.addEventListener(type, record, true);
  return () => {
    for (const type of nativeEvents) document.removeEventListener(type, record, true);
    neutral.remove();
  };
}

function render() {
  root?.unmount();
  container?.remove();
  container = document.createElement("div");
  container.id = "root";
  document.body.prepend(container);
  root = createRoot(container);
  flushSync(() => root!.render(<Fixture />));
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 30));

/** The log of `step` run by `driver`, on a fixture rendered again, after `rest` moves the mice off it. */
export async function logOf(
  step: Step,
  driver: Driver,
  rest: () => Promise<void>,
): Promise<string[]> {
  render();
  await rest();
  await step.before?.(driver);
  await settle();
  log.length = 0;
  await step.run(driver);
  await settle();
  return [...log];
}

// Entries whose place in the log is the browser's: `select()` queues its
// `select` event as a task, which runs before Playwright's typing or after
// it, as the round trip of CDP takes, and after the package's, which types
// at once; a `scroll` comes with the next frame, after as many of the
// package's events as come before it. React's `onSelect` and `onScroll`
// follow them. They are in both logs, anywhere.
export const unordered = (entry: string) =>
  /^(select|react:onSelect|scroll|react:onScroll)@/.test(entry);

// Entries that come with a frame, as many as the frames of a scroll: they
// count as there or not.
const ofFrames = (entry: string) => /^(scroll|react:onScroll)@/.test(entry);

/**
 * How a log of the package differs from Playwright's: the entries of
 * Playwright's it has fewer of (`- entry`, once for each one fewer) and the
 * ones it has more of than Playwright's (`+ entry`), and whether the entries
 * of both are in the same order.
 */
export function compareLogs(
  theirs: string[],
  our: string[],
): { differences: string[]; sameOrder: boolean } {
  const counts = (entries: string[]) => {
    const count = new Map<string, number>();
    for (const entry of entries)
      count.set(entry, ofFrames(entry) ? 1 : (count.get(entry) ?? 0) + 1);
    return count;
  };
  const theirCount = counts(theirs);
  const ourCount = counts(our);
  const beyond = (count: Map<string, number>, other: Map<string, number>, sign: string) =>
    [...count].flatMap(([entry, n]) =>
      Array.from({ length: Math.max(0, n - (other.get(entry) ?? 0)) }, () => `${sign} ${entry}`),
    );
  const differences = [...beyond(theirCount, ourCount, "-"), ...beyond(ourCount, theirCount, "+")];
  const ordered = (entries: string[], other: string[]) =>
    entries.filter((entry) => other.includes(entry) && !unordered(entry));
  const sameOrder = JSON.stringify(ordered(theirs, our)) === JSON.stringify(ordered(our, theirs));
  return { differences, sameOrder };
}
