import { userEvent as testingLibraryUserEvent } from "@testing-library/user-event";
import { expect } from "vitest";
import type { Locator } from "vitest/browser";

// Clicks and fills of tests/vitest-user-event/: events that Testing Library
// dispatches in the page itself, where `locator.click()` and `locator.fill()`
// of tests/vitest/ send each to Node.js, which has Playwright do it. Without
// delays between the events.
const user = testingLibraryUserEvent.setup({ delay: null });

/** The element, once the page has it: as a locator's action waits for it. */
async function find(locator: Locator): Promise<HTMLElement> {
  await expect.element(locator).toBeInTheDocument();
  return locator.element() as HTMLElement;
}

export async function click(locator: Locator): Promise<void> {
  await user.click(await find(locator));
}

/** Replaces the value, in one input event, as Playwright's `fill()` does. */
export async function fill(locator: Locator, text: string): Promise<void> {
  const element = await find(locator);
  await user.clear(element);
  if (text) await user.paste(text);
}
