// The fidelity test in a DOM of Node.js, happy-dom's or jsdom's: each step
// of the browser's, run with the package's actions, against Playwright's
// log of it in Chromium, recorded in playwright-logs.json. A difference
// that is not in `expectedDifferences` fails; each there comes of what such
// a DOM has not, which the README's section on it says.

import { afterAll, beforeAll, expect, test } from "vitest";
import { page, UnsupportedError } from "../../src/index.ts";
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
const environment = navigator.userAgent.includes("HappyDOM") ? "happy-dom" : "jsdom";

/**
 * Playwright's log as it is where nothing is laid out: the mouse is on the
 * button itself, where Chromium's hit test finds the `<span>` in it, which
 * the mouse then neither enters nor leaves.
 */
function withoutHitTest(entries: string[]): string[] {
  return entries
    .filter((entry) => !/^(pointer|mouse)(enter|leave)@button-label /.test(entry))
    .map((entry) =>
      entry
        .replaceAll("@button-label ", "@button ")
        .replaceAll("related=button-label", "related=button"),
    );
}

// happy-dom's `InputEvent` has the `data` of `null` as "".
const dataOfNull = (inputType: string, id: string, events = ["beforeinput", "input"]) => [
  ...events.map((type) => `- ${type}@${id} ${inputType} null`),
  ...events.map((type) => `+ ${type}@${id} ${inputType} ""`),
];

/** What the package does otherwise in a DOM of Node.js than Playwright in Chromium, by step: what the DOM does otherwise. */
const expectedDifferences: Record<string, string[]> = {
  // The label's own click of its checkbox is the DOM's: a `MouseEvent`, of a
  // `detail` of 0 in happy-dom, and no focus.
  "click a label": [
    "- focus@check",
    "- focusin@check",
    "- react:onFocus@check",
    "- click@check button=0 buttons=0 detail=1 pointerType=mouse",
    `+ click@check button=0 buttons=0 detail=${environment === "jsdom" ? 1 : 0}`,
  ],
  // Nothing scrolls; happy-dom's `WheelEvent` is no `MouseEvent`.
  "wheel over a box that scrolls": [
    ...(environment === "happy-dom"
      ? ["- wheel@scrolled button=0 buttons=0 detail=0 deltaX=0 deltaY=30"]
      : []),
    "- react:onScroll@scroller",
    "- scroll@scroller",
    ...(environment === "happy-dom" ? ["+ wheel@scrolled"] : []),
  ],
  ...(environment === "happy-dom"
    ? {
        "fill with nothing": dataOfNull("deleteContentForward", "text"),
        "clear a textarea": dataOfNull("deleteContentForward", "notes"),
        "Enter in a form's input": dataOfNull("insertLineBreak", "name", ["beforeinput"]),
        Backspace: dataOfNull("deleteContentBackward", "name"),
      }
    : {
        // React's `onSelect` sees a selection in jsdom's `select()`.
        "fill a controlled input": ["+ react:onSelect@text"],
      }),
};

// happy-dom's label clicks its control before its own click reaches React's root.
const reordered = environment === "happy-dom" ? ["click a label"] : [];

// jsdom has no `DataTransfer`, to set the files of an input with.
const unsupported = environment === "jsdom" ? ["upload files"] : [];

test.each(steps)("$name: the log of the package's action is Playwright's", async (step) => {
  const theirs = recorded[step.name];
  expect(theirs, "Playwright's log of the step, in playwright-logs.json").toBeDefined();
  if (unsupported.includes(step.name)) {
    await expect(logOf(step, ours, rest)).rejects.toThrow(UnsupportedError);
    return;
  }
  const our = await logOf(step, ours, rest);
  expect(
    compareLogs(withoutHitTest(theirs!), our),
    `Playwright:\n${withoutHitTest(theirs!).join("\n")}\n\ndom-locators:\n${our.join("\n")}`,
  ).toEqual({
    differences: expectedDifferences[step.name] ?? [],
    sameOrder: !reordered.includes(step.name),
  });
});
