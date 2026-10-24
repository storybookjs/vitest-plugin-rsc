# dom-locators

Vitest browser mode's `page` and its locators, with their waiting and their actions, answered inside the document under test: no selector engine of the provider, no round trip to it, no Testing Library.

A test of `vitest/browser` changes one import:

```diff
- import { page } from "vitest/browser";
+ import { page } from "dom-locators";

  await page.getByLabelText("Title").fill("Groceries");
  await page.getByRole("button", { name: "Create note" }).click();
  await expect.element(page.getByText("Note created.")).toBeInTheDocument();
```

A private package of this repository, for its playgrounds and its benchmark: not on npm.

## The contract

For every locator it accepts, `dom-locators` returns the elements that Vitest's `page` returns, in the same order. A locator, an option or a method it does not model throws `UnsupportedError` with the reason. It never returns another element.

The roles, the ARIA states, the accessible names and the text matching are Playwright's, ported from the engine Vitest 5's locators run (ivya 1.8.2, Playwright at 4554372e, see [NOTICE](NOTICE)). The package's own suite holds every locator of a table, on an ARIA page and on the routes of the notes app, to `vitest/browser`'s `page`: the same elements, the same `selector`, the same `asLocator()`.

Vitest's defaults apply: `exact` is Vitest's `browser.locators.exact` (`true` unless your config says otherwise) and `getByTestId()` reads `browser.locators.testIdAttribute`.

## What there is

- `page`: `getByRole`, `getByText`, `getByLabelText`, `getByPlaceholder`, `getByAltText`, `getByTitle`, `getByTestId`, `elementLocator(element)`, `extend(methods)`.
- A locator: the same `getBy*`, `filter({ hasText, hasNotText, has, hasNot })`, `nth`, `first`, `last`, `and`, `or`, `all`, `element`, `elements`, `query`, `length`, `findElement({ timeout, strict })`, `selector`, `toString`, `asLocator`, `serialize`, `toJSON`.
- Actions: `click`, `dblClick`, `hover`, `unhover`, `fill`, `clear`, `selectOptions`, and `press(key)`, which Vitest's `Locator` does not have (Playwright's `locator.press()`): `"Enter"`, `"Escape"`, `"Tab"`, `"Backspace"`, `"Delete"`, `"Space"` or `" "`, or one printable character. An action takes `{ timeout }`; any other option throws.
- `configure({ testIdAttribute, timeout })`, and `UnsupportedError`.

`expect.element(locator)` takes a locator of the package, with `.not`, `toHaveLength` and `{ timeout }`: it carries Vitest's locator symbol and has the methods `expect.element` calls. A locator is assignable to `Locator` of `vitest/browser`.

Not yet, on the type and throwing with the way out, `vitestPage.elementLocator(await locator.findElement())`: `tripleClick`, `wheel`, `upload`, `dropTo`, `screenshot`, `mark`, `page.viewport`, `page.screenshot`, `page.mark`, `page.frameLocator`. Nor shadow DOM, which Vitest's locators look into: a query that meets an open shadow root throws. A locator of `vitest/browser` in `filter({ has })`, `and` or `or` throws too.

## Waiting

One look now, one after each batch of changes of the DOM (one `MutationObserver` for the whole wait), one every 50 ms besides, until the deadline: the caller's `timeout`, else the running test's time left (minus Vitest's margin, so the locator is in the error), else `configure({ timeout })`, 1000 ms by default. `findElement()` and every action wait so; `expect.element()` waits through `findElement()`. The test's fake timers do not stop it.

An action waits for one element and that it is visible and, for `click`, `dblClick`, `fill`, `clear` and `selectOptions`, enabled; `fill` and `clear` also editable. A disabled button is not clicked: the action fails after its timeout, naming the locator and what it waited for.
