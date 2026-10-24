import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { seedApp } from "./app.ts";
import { measure, untilDom } from "./harness.ts";

// What waiting for an element costs: `expect.element()` and
// `locator.findElement()`. For an element that is there, the call itself.
// For one that a Server Action brings, the latency of the wait: from the
// change of the DOM that made it match, which a MutationObserver of the test
// sees, until the assertion resolved. Vitest looks again after 0, 20, 50,
// 100, 100 and then every 500 ms; the speed feature `watchDom` on every change
// of the DOM and every 5 ms.

test("expect.element on an element that is there", async () => {
  await seedApp();
  await renderServer({ url: "/notes" });
  const heading = page.getByRole("heading", { name: "Notes" });
  await measure("Waiting › expect.element(present).toBeInTheDocument()", async () => {
    await expect.element(heading).toBeInTheDocument();
  });
  await measure("Waiting › locator.findElement(), present", async () => {
    await heading.findElement();
  });
});

test("waiting for an element that a Server Action brings", async () => {
  const { notes } = await seedApp();
  await renderServer({ url: `/notes/${notes[0]!.id}` });
  const button = () => document.querySelector<HTMLButtonElement>("button[aria-pressed]")!;
  const waitFor =
    (wait: (locator: ReturnType<typeof page.getByRole>) => Promise<unknown>) =>
    async ({ start }: { start: number }) => {
      const target = button().textContent === "Favorite" ? "Unfavorite" : "Favorite";
      const appeared = untilDom(() => button().textContent === target, 5_000);
      button().click();
      await wait(page.getByRole("button", { name: target, exact: true }));
      const resolved = performance.now();
      const appearedAt = await appeared;
      return { total: resolved - appearedAt, "click → resolved": resolved - start };
    };
  await measure(
    "Waiting › expect.element() after a Server Action, latency from the DOM change",
    waitFor((locator) => expect.element(locator).toBeInTheDocument()),
  );
  await measure(
    "Waiting › locator.findElement() after a Server Action, latency from the DOM change",
    waitFor((locator) => locator.findElement()),
  );
});
