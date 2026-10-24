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

Open shadow roots are looked into, as Vitest's locators do and in their order: a tree's elements, then the trees of its shadow roots, each host's in the order of the document. A closed shadow root is nobody's: neither finds what is in it. Next's `<next-route-announcer>`, on every page of the App Router, is one.

Vitest's defaults apply: `exact` is Vitest's `browser.locators.exact` (`true` unless your config says otherwise) and `getByTestId()` reads `browser.locators.testIdAttribute`.

## What there is

- `page`: `getByRole`, `getByText`, `getByLabelText`, `getByPlaceholder`, `getByAltText`, `getByTitle`, `getByTestId`, `elementLocator(element)`, `extend(methods)`.
- A locator: the same `getBy*`, `filter({ hasText, hasNotText, has, hasNot })`, `nth`, `first`, `last`, `and`, `or`, `all`, `element`, `elements`, `query`, `length`, `findElement({ timeout, strict })`, `selector`, `toString`, `asLocator`, `serialize`, `toJSON`.
- Actions: `click`, `dblClick`, `hover`, `unhover`, `fill`, `clear`, `selectOptions`, and `press(key)`, which Vitest's `Locator` does not have (Playwright's `locator.press()`): `"Enter"`, `"Escape"`, `"Tab"`, `"Backspace"`, `"Delete"`, `"Space"` or `" "`, or one printable character. An action takes `{ timeout }`; any other option throws.
- `configure({ testIdAttribute, timeout })`, and `UnsupportedError`.

`expect.element(locator)` takes a locator of the package, with `.not`, `toHaveLength` and `{ timeout }`: it carries Vitest's locator symbol and has the methods `expect.element` calls. A locator is assignable to `Locator` of `vitest/browser`.

Not yet, on the type and throwing with the way out, `vitestPage.elementLocator(await locator.findElement())`: `tripleClick`, `wheel`, `upload`, `dropTo`, `screenshot`, `mark`, `page.viewport`, `page.screenshot`, `page.mark`, `page.frameLocator`. A locator of `vitest/browser` in `filter({ has })`, `and` or `or` throws too.

## Waiting

One look now, one after each batch of changes of the DOM (one `MutationObserver` for the whole wait), one every 50 ms besides, until the deadline: the caller's `timeout`, else the running test's time left (minus Vitest's margin, so the locator is in the error), else `configure({ timeout })`, 1000 ms by default. `findElement()` and every action wait so; `expect.element()` waits through `findElement()`. The test's fake timers do not stop it.

An action waits for one element and that it is visible and, for `click`, `dblClick`, `fill`, `clear` and `selectOptions`, enabled; `fill` and `clear` also editable. A disabled button is not clicked: the action fails after its timeout, naming the locator and what it waited for.

## Events

The actions dispatch what Chrome dispatches for Playwright's own (`vitest/browser`'s `click()`, `fill()`, ..., and `userEvent.keyboard()` for `press()`). The package's suite holds them to it, step by step, on a fixture of React's handlers and the native events: a button with a `<span>` in it, a link, a controlled input with `maxlength`, a textarea, a checkbox and its label, a `<select>`, and a form with an action of `useActionState`. Every log is Playwright's, with the differences of this table.

| action             | dispatches                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | otherwise than Playwright                                                                                                                                               |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `click`            | the mouse's way there: `pointerout`, `pointerleave` (innermost first), `pointerover`, `pointerenter` (outermost first), the same of the mouse, `pointermove`, `mousemove`; then `pointerdown`, `mousedown`, the focus moving to the focusable element it is in (or away), `pointerup`, `mouseup`, `click`, on what is at the middle of the element (the `<span>` in a button)                                                                                                                       | an element on top of it, an overlay, does not stop the click: the element gets it, where Playwright waits; no check that the element is still                           |
| `dblClick`         | as `click`, twice (`detail` 1 and 2), then `dblclick`                                                                                                                                                                                                                                                                                                                                                                                                                                               | as `click`                                                                                                                                                              |
| `hover`, `unhover` | the mouse's way onto the element, or onto the body                                                                                                                                                                                                                                                                                                                                                                                                                                                  | as `click`                                                                                                                                                              |
| `fill`             | the focus, `select`, `beforeinput` (`insertText`, which can cancel it), the value past React's tracker, cut by `maxlength`, `input`; `change` once the focus leaves, or on Enter. `fill("")`: `keydown` Delete, `beforeinput`, `input` (`deleteContentForward`), `keyup`                                                                                                                                                                                                                            | `select`, a task that `select()` queues, comes after the edit, where Playwright's comes before or after it, as its round trip takes; a `contenteditable` element throws |
| `clear`            | `fill("")`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | as `fill`                                                                                                                                                               |
| `selectOptions`    | the options selected, by value, label, element or locator, every other one not, `input`, `change`; no focus                                                                                                                                                                                                                                                                                                                                                                                         | a disabled option is waited for, then fails                                                                                                                             |
| `press`            | the focus (the caret at the start of a text input it comes to), `keydown`, `keypress` for Enter, Space and a character, what the key does, `keyup` on what has the focus then. Enter: a button's or a link's `click` (a link's on `keydown`), a textarea's line break, a text input's `change` and the form's implicit submission. Space: a button's or a checkbox's `click` after `keyup`. Tab: the focus to the next element in the tab order. Backspace, Delete and characters edit a text input | the `code` and `keyCode` of punctuation are empty, as they depend on the layout of the keyboard; no modifiers, no arrows, no IME                                        |

Every event is the page's own, so `isTrusted` is `false`, where Playwright's are the browser's: a page that checks it sees the difference. The coordinates are the middle of the element in the window; `screenX` and `screenY` are 0.
