// The Node side of the fidelity test's oracle of the keyboard: Playwright's
// own `locator.press()` and `locator.pressSequentially()`, which Vitest's
// `Locator` has not, on the element of a locator of `vitest/browser`.

import type { BrowserCommand } from "vitest/node";

/** Playwright's `locator.press(key)`. */
export const playwrightPress: BrowserCommand<[selector: string, key: string]> = async (
  context,
  selector,
  key,
) => {
  if (context.provider.name !== "playwright") throw new Error("Playwright's press() only");
  await context.iframe.locator(selector).press(key);
};

/** Playwright's `locator.pressSequentially(text)`. */
export const playwrightPressSequentially: BrowserCommand<[selector: string, text: string]> = async (
  context,
  selector,
  text,
) => {
  if (context.provider.name !== "playwright")
    throw new Error("Playwright's pressSequentially() only");
  await context.iframe.locator(selector).pressSequentially(text);
};
