import type { Page } from "playwright";
import { expect } from "vitest";
import type { PageErrors } from "../../test-helpers/host.ts";
import type { HostWindow } from "../host/state.ts";
import { style } from "./host-page.ts";

/** Opens a view of the host: `open()` of the dev server's test, or the build's. */
export type OpenView = (
  page: Page,
  errors: PageErrors,
  view: string,
  run: (page: Page) => Promise<void>,
) => Promise<HostWindow>;

// JSX of the rsc layer with client references, rendered by the React of the
// browser layer in the host's document: ?view=references of host/main.tsx.
// The same for the dev server (references.test.ts) and the static build
// (../build-test/static-build.test.ts).

type References = NonNullable<HostWindow["__hostReferences"]>;
const references = (page: Page) =>
  page.evaluate(() => {
    const { resolve: _, rerender: __, ...rest } = (window as HostWindow).__hostReferences!;
    return rest as Omit<References, "resolve" | "rerender">;
  });

/** Warnings of the page, which React logs with `console.warn` and `console.error`. */
export function collectWarnings(page: Page): string[] {
  const warnings: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "warning") warnings.push(message.text());
  });
  return warnings;
}

/** Renders the tree of references, and checks every part of it. */
export async function expectReferencesRender(
  page: Page,
  errors: PageErrors,
  open: OpenView,
  query = "",
) {
  const warnings = collectWarnings(page);
  let seen: Awaited<ReturnType<typeof references>> | undefined;
  await open(page, errors, `references${query}`, async (page) => {
    seen = await references(page);
    // What a `play` function sees as soon as the render resolved: the tree,
    // whose references had not loaded when it started.
    expect(seen.atResolve).toEqual({ counter: "first dark 0", late: true, added: false });
    const root = page.locator("#host-root");
    // Context, state, useId.
    await root.getByTestId("counter-first").click();
    await expect.poll(() => root.getByTestId("counter-first").textContent()).toBe("first dark 1");
    const ids = await page.evaluate(() =>
      ["first", "second"].map(
        (label) => document.querySelector(`[data-testid=counter-${label}]`)!.id,
      ),
    );
    expect(ids[0]).toMatch(/\S/);
    expect(ids[0]).not.toBe(ids[1]);
    // `use()` under Suspense, of a promise of the rsc layer.
    expect(await root.getByTestId("value-fallback").textContent()).toBe("waiting");
    await page.evaluate(() => (window as HostWindow).__hostReferences!.resolve("resolved"));
    await expect.poll(() => root.getByTestId("value").textContent()).toBe("resolved");
    // memo, forwardRef with a callback ref of the rsc layer, a class.
    expect(await root.getByTestId("memoed").textContent()).toBe("memo");
    expect(await root.getByTestId("forwarded").textContent()).toBe("forwarded");
    expect(await root.getByTestId("klass").textContent()).toBe("class");
    expect((await references(page)).refs).toContain("EM");
    // A Client Component of a package, and one of the app, with their CSS.
    expect(await root.getByTestId("tag").textContent()).toBe("tag");
    expect(await style(page, "[data-testid=tag]", "color")).toBe("rgb(128, 0, 128)");
    expect(await style(page, "#host-root button[class*=badge]", "color")).toBe("rgb(0, 128, 0)");
    // next/link.
    expect(await root.getByTestId("link").getAttribute("href")).toBe("/elsewhere");
    // Browser code sees the exports of a file with "use client", as with
    // Flight: the type of a child and its static, a context as a type and as
    // a value, and a function that it calls.
    expect(await root.getByTestId("tabs-seen").textContent()).toBe("TABS! bold TabPanel,TabPanel");
    expect(await root.getByTestId("tab-panel").allTextContents()).toEqual(["one", "two"]);
    // A keyed list keeps the state of each item as it moves.
    await root.getByTestId("item").first().getByRole("button").click();
    await root.getByTestId("item").first().getByRole("button").click();
    // Rendered again with a reference whose file nothing loaded yet, as a
    // story with other args: there once the render resolved.
    const again = await page.evaluate(() =>
      (window as HostWindow).__hostReferences!.rerender(["c", "b", "a"], true),
    );
    expect(again).toEqual({ counter: "first dark 1", late: true, added: true });
    expect(await root.getByTestId("item").allTextContents()).toEqual(["c:0", "b:0", "a:2"]);
    // The export that rendered is the one a file of the host imports.
    expect(await root.getByTestId("tone").getAttribute("data-evaluation")).toBe(
      seen.directEvaluation,
    );
  });
  expect(warnings).toEqual([]);
  return seen!;
}
