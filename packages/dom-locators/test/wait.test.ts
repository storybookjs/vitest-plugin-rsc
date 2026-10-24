// The wait: one look now, one per batch of changes of the DOM, one per 50 ms,
// until the caller's timeout, else the running test's deadline.

import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { page } from "../src/index.ts";

beforeEach(() => {
  document.body.innerHTML = "<main></main>";
});
afterEach(() => {
  vi.useRealTimers();
});

const main = () => document.querySelector("main")!;
const nextTask = () => new Promise((resolve) => setTimeout(resolve, 0));

test("finds at once what is there, with one look", async () => {
  main().innerHTML = "<button>Save</button>";
  const locator = page.getByRole("button", { name: "Save" });
  const looks = vi.spyOn(locator, "elements");
  expect(await locator.findElement()).toBe(document.querySelector("button"));
  expect(looks).toHaveBeenCalledTimes(1);
});

test("looks once per batch of changes of the DOM", async () => {
  const locator = page.getByRole("button", { name: "Save" });
  const looks = vi.spyOn(locator, "elements");
  const found = locator.findElement();
  expect(looks).toHaveBeenCalledTimes(1);
  // Three changes in one task: one look.
  main().append(document.createElement("p"));
  main().setAttribute("class", "x");
  main().append(document.createElement("span"));
  await nextTask();
  expect(looks).toHaveBeenCalledTimes(2);
  // The change that brings it.
  main().innerHTML = "<button>Save</button>";
  expect(await found).toBe(document.querySelector("button"));
  expect(looks).toHaveBeenCalledTimes(3);
});

test("looks every 50 ms for a change that is no change of the DOM", async () => {
  main().innerHTML = '<button class="later">Save</button>';
  const style = document.createElement("style");
  document.head.append(style);
  style.sheet!.insertRule(".later { display: none }");
  const locator = page.getByRole("button", { name: "Save" });
  const found = locator.findElement({ timeout: 1000 });
  await nextTask();
  // A rule of a stylesheet: no record of a MutationObserver.
  style.sheet!.deleteRule(0);
  const start = performance.now();
  expect(await found).toBe(document.querySelector("button"));
  expect(performance.now() - start).toBeLessThan(150);
  style.remove();
});

test("a caller's timeout wins", async () => {
  const start = performance.now();
  await expect(page.getByText("Never").findElement({ timeout: 100 })).rejects.toThrow(
    "Cannot find element with locator: getByText('Never')",
  );
  const elapsed = performance.now() - start;
  expect(elapsed).toBeGreaterThanOrEqual(95);
  expect(elapsed).toBeLessThan(400);
});

test(
  "without a timeout, waits until just before the test times out",
  { timeout: 600 },
  async () => {
    const start = performance.now();
    await expect(page.getByText("Never").findElement()).rejects.toThrow("Cannot find element");
    const elapsed = performance.now() - start;
    // Vitest's deadline, less its margin of 100 ms: the error is the locator's, not the test's.
    expect(elapsed).toBeGreaterThan(300);
    expect(elapsed).toBeLessThan(600);
  },
);

test("waits with the page's own timers when the test's are fake", async () => {
  vi.useFakeTimers();
  const found = page.getByText("Later").findElement({ timeout: 1000 });
  main().innerHTML = "<p>Later</p>";
  expect(await found).toBe(document.querySelector("p"));
});

test("rejects at once for more than one, with strict", async () => {
  const found = page.getByText("Two").findElement({ timeout: 1000 });
  await nextTask();
  main().innerHTML = "<p>Two</p><p>Two</p>";
  await expect(found).rejects.toThrow(
    "strict mode violation: getByText('Two') resolved to 2 elements",
  );
});

test("an action waits for its element to be enabled, then fails naming the locator", async () => {
  main().innerHTML = "<button disabled>Save</button>";
  const start = performance.now();
  await expect(page.getByRole("button", { name: "Save" }).click({ timeout: 150 })).rejects.toThrow(
    "click() timed out: getByRole('button', { name: 'Save' }) is disabled.",
  );
  expect(performance.now() - start).toBeGreaterThanOrEqual(145);
  // Enabled in time: clicked.
  const clicked = vi.fn();
  document.querySelector("button")!.addEventListener("click", clicked);
  const click = page.getByRole("button", { name: "Save" }).click({ timeout: 1000 });
  await nextTask();
  document.querySelector("button")!.disabled = false;
  await click;
  expect(clicked).toHaveBeenCalledOnce();
});

test("an action waits for its element to be visible", async () => {
  main().innerHTML = '<button style="display: none">Save</button>';
  const click = page
    .getByRole("button", { name: "Save", includeHidden: true })
    .click({ timeout: 1000 });
  await nextTask();
  document.querySelector("button")!.style.display = "";
  await click;
  await expect(
    page.getByRole("button", { name: "Save", includeHidden: true }).hover({ timeout: 0 }),
  ).resolves.toBeUndefined();
  document.querySelector("button")!.style.visibility = "hidden";
  await expect(
    page.getByRole("button", { name: "Save", includeHidden: true }).click({ timeout: 50 }),
  ).rejects.toThrow("is not visible");
});
