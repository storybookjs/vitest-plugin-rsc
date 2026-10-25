// The errors: the first lines of "cannot find" and of a strict mode
// violation are Vitest's own, and what the package does not model throws,
// naming the reason, where Vitest's page would answer.

import { beforeEach, expect, test } from "vitest";
import { page as vitestPage } from "vitest/browser";
import { configure, page, UnsupportedError } from "../src/index.ts";

beforeEach(() => {
  document.body.innerHTML = `
    <main><button>Save</button><button>Save draft</button><button>Cancel</button></main>
    <p>Text</p>`;
});

const firstLine = (error: unknown) =>
  `${(error as Error).name}: ${(error as Error).message.split("\n")[0]}`;
function thrown(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  throw new Error("Expected an error");
}
async function rejected(run: () => Promise<unknown>): Promise<unknown> {
  try {
    await run();
  } catch (error) {
    return error;
  }
  throw new Error("Expected a rejection");
}

test("element() of nothing fails with Vitest's first line, and the DOM", () => {
  const ours = thrown(() => page.getByRole("button", { name: "Nope" }).element());
  const theirs = thrown(() => vitestPage.getByRole("button", { name: "Nope" }).element());
  expect(firstLine(ours)).toBe(firstLine(theirs));
  expect(firstLine(ours)).toBe(
    "VitestBrowserElementError: Cannot find element with locator: getByRole('button', { name: 'Nope' })",
  );
  expect((ours as Error).message).toContain("<button>");
});

test("element() and query() of more than one fail with Vitest's first line", () => {
  for (const method of ["element", "query"] as const) {
    const ours = thrown(() => page.getByRole("button", { name: "Save", exact: false })[method]());
    const theirs = thrown(() =>
      vitestPage.getByRole("button", { name: "Save", exact: false })[method](),
    );
    expect(firstLine(ours)).toBe(firstLine(theirs));
  }
  expect((thrown(() => page.getByRole("button").element()) as Error).message).toMatch(
    /^strict mode violation: getByRole\('button'\) resolved to 3 elements:\n {4}1\) <button>Save<\/button>/,
  );
});

test("findElement() fails as Vitest's, for nothing in time and for more than one", async () => {
  const none = (p: typeof page | typeof vitestPage) =>
    p.getByText("Nope").findElement({ timeout: 0 });
  expect(firstLine(await rejected(() => none(page)))).toBe(
    firstLine(await rejected(() => none(vitestPage))),
  );
  const many = (p: typeof page | typeof vitestPage) =>
    p.getByRole("button").findElement({ timeout: 0 });
  expect(firstLine(await rejected(() => many(page)))).toBe(
    firstLine(await rejected(() => many(vitestPage))),
  );
  // Not strict: the first.
  expect(await page.getByRole("button").findElement({ strict: false })).toBe(
    document.querySelector("button"),
  );
});

test("a chain prints as Vitest's in its error", () => {
  const build = (p: typeof page | typeof vitestPage) =>
    p.getByRole("main").getByRole("button").filter({ hasText: "Save" }).nth(1).getByText("x");
  expect(firstLine(thrown(() => build(page).element()))).toBe(
    firstLine(thrown(() => build(vitestPage).element())),
  );
});

test("an option the package does not model throws, where Vitest's page ignores it", () => {
  // @ts-expect-error Testing Library's option, not Vitest's.
  expect(() => page.getByRole("button", { hidden: true })).toThrow(UnsupportedError);
  // @ts-expect-error not an option of getByText().
  expect(() => page.getByText("Save", { selector: "button" })).toThrow(/has no option "selector"/);
  // @ts-expect-error not an option of filter().
  expect(() => page.getByRole("button").filter({ visible: true })).toThrow(
    /has no option "visible"/,
  );
  // @ts-expect-error not an option of configure().
  expect(() => configure({ exact: false })).toThrow(/has no option "exact"/);
});

test("an action's option the package does not model throws, and so does an invalid one", async () => {
  // @ts-expect-error Playwright's option, which the page does not model.
  await expect(page.getByText("Text").click({ delay: 10 })).rejects.toThrow(
    /click\(\) has no option "delay"/,
  );
  const cancel = page.getByRole("button", { name: "Cancel" });
  // @ts-expect-error an option of click(), not of fill().
  await expect(cancel.fill("x", { position: { x: 1, y: 1 } })).rejects.toThrow(
    /fill\(\) has no option "position"/,
  );
  // @ts-expect-error an option of click(), not of dblClick().
  await expect(cancel.dblClick({ clickCount: 3 })).rejects.toThrow(/has no option "clickCount"/);
  // @ts-expect-error no such button.
  await expect(cancel.click({ button: "back" })).rejects.toThrow(/invalid button/);
  // @ts-expect-error no such modifier.
  await expect(cancel.hover({ modifiers: ["Hyper"] })).rejects.toThrow(/invalid modifiers/);
  // @ts-expect-error a delta and a direction.
  await expect(cancel.wheel({ delta: { y: 1 }, direction: "up" })).rejects.toThrow(/either/);
});

test("dropTo() of what the browser drags itself, or onto a locator of vitest/browser, throws", async () => {
  document.body.innerHTML += '<div draggable="true">Card</div><a href="#x">Link</a>';
  const target = page.getByRole("button", { name: "Cancel" });
  await expect(page.getByText("Card").dropTo(target)).rejects.toThrow(UnsupportedError);
  await expect(page.getByRole("link").dropTo(target)).rejects.toThrow(UnsupportedError);
  // @ts-expect-error a locator of vitest/browser.
  await expect(page.getByText("Text").dropTo(vitestPage.getByText("Text"))).rejects.toThrow(
    UnsupportedError,
  );
});

test("upload() of a path throws: the page cannot read a file", async () => {
  await expect(page.getByText("Text").upload("file.txt")).rejects.toThrow(UnsupportedError);
});

test("an open shadow root is looked into, as Vitest's locators do, a closed one by neither", () => {
  const open = document.createElement("div");
  open.attachShadow({ mode: "open" }).innerHTML = "<button>Inside</button>";
  const closed = document.createElement("div");
  closed.attachShadow({ mode: "closed" }).innerHTML = "<button>Closed</button>";
  document.body.append(open, closed);
  const inside = open.shadowRoot!.querySelector("button");
  expect(page.getByRole("button", { name: "Inside" }).elements()).toEqual([inside]);
  expect(vitestPage.getByRole("button", { name: "Inside" }).elements()).toEqual([inside]);
  expect(page.getByText("Closed").elements()).toEqual([]);
  expect(vitestPage.getByText("Closed").elements()).toEqual([]);
});

test("a locator of vitest/browser in filter, and or, throws", () => {
  // @ts-expect-error a locator of vitest/browser.
  expect(() => page.getByRole("main").filter({ has: vitestPage.getByRole("button") })).toThrow(
    /takes a locator of dom-locators/,
  );
  // @ts-expect-error a locator of vitest/browser.
  expect(() => page.getByRole("main").and(vitestPage.getByRole("main"))).toThrow(UnsupportedError);
});

test("a deferred method throws, naming the way out", () => {
  const locator = page.getByRole("button", { name: "Cancel" });
  for (const call of [
    () => locator.screenshot(),
    () => locator.mark("step"),
    () => page.viewport(100, 100),
    () => page.screenshot(),
    () => page.frameLocator(locator),
  ]) {
    expect(call).toThrow(/page\.elementLocator\(await locator\.findElement\(\)\)/);
  }
});

test("a key the package does not press throws", async () => {
  const button = page.getByRole("button", { name: "Cancel" });
  await expect(button.press("F5")).rejects.toThrow(UnsupportedError);
  await expect(button.press("Hyper+a")).rejects.toThrow(
    /press\("Hyper\+a"\) is not in dom-locators/,
  );
  document.body.innerHTML = '<input aria-label="Name"><select aria-label="Fruit"></select>';
  await expect(page.getByLabelText("Name").press("Control+z")).rejects.toThrow(UnsupportedError);
  await expect(page.getByLabelText("Name").press("ArrowUp")).rejects.toThrow(UnsupportedError);
  await expect(page.getByLabelText("Fruit").press("ArrowDown")).rejects.toThrow(UnsupportedError);
});

test("filter() without a filter throws Vitest's error", () => {
  const theirs = thrown(() => vitestPage.getByRole("button").filter({}));
  expect(() => page.getByRole("button").filter({})).toThrow((theirs as Error).message);
});
