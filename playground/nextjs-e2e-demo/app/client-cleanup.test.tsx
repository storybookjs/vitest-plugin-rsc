"use client";

import { fireEvent, render as renderWithTestingLibrary, screen } from "@testing-library/react";
import { ClientBadge } from "styled-package/client-badge";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  inject,
  test,
  vi,
  type MockInstance,
} from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { linkedStylesheets, renderedContainers } from "../test/browser.ts";
import { PressButton } from "./components/press-button.tsx";
import { toast } from "./components/toaster.tsx";

// A second test file with `"use client"`, next to client.test.tsx. The tab
// loads vitest-browser-react and Testing Library once, for the first of the
// two that runs, so the `beforeEach()` that vitest-browser-react registers
// as it loads is only the first file's, as in Vitest without Next with
// `isolate: false`. What a test or a file leaves, vitest.setup.client.tsx
// has them take away before the next one. Every test here holds in any
// order of the files and of their tests.

let consoleError: MockInstance<typeof console.error>;

beforeEach(() => {
  vi.restoreAllMocks();
  consoleError = vi.spyOn(console, "error");
  // What vitest-browser-react rendered before, in this file or another one.
  expect(renderedContainers()).toEqual([]);
});

afterEach(() => {
  // React warns about a root that is rendered into after it was unmounted.
  expect(consoleError.mock.calls).toEqual([]);
});

test("links the CSS of a Client Component of a package, and none of another file", async () => {
  const { getByText } = await render(<ClientBadge>Badge of a package</ClientBadge>);

  await expect.element(getByText("Badge of a package")).toHaveStyle({ color: "rgb(0, 0, 128)" });
  expect(linkedStylesheets()).toContainEqual(expect.stringContaining("client-badge.css"));
  // That of the card that client.test.tsx imports went with it.
  expect(linkedStylesheets()).not.toContainEqual(expect.stringContaining("client-card.module.css"));
});

// A container of the file's own, which its tests render into, each in turn.
// vitest-browser-react takes away only a container that is in the body.
let container: HTMLElement;
beforeAll(() => {
  const section = document.body.appendChild(document.createElement("section"));
  container = section.appendChild(document.createElement("div"));
});
afterAll(() => container.parentElement!.remove());

test.for(["one test", "another"])(
  "renders into a container that the tests share: %s",
  async (name) => {
    const { getByText } = await render(<p>Rendered by {name}</p>, { container });

    await expect.element(getByText(`Rendered by ${name}`)).toBeVisible();
    expect(container.childElementCount).toBe(1);
  },
);

test.for(["one test", "another"])(
  "leaves the root of a library to the library: %s",
  async (name) => {
    // The toaster renders every toast into the root it made for the first one.
    toast(`Toast of ${name}`);

    await expect.element(page.getByText(`Toast of ${name}`)).toBeVisible();
  },
);

test.skipIf(inject("build") === "production")(
  "renders with Testing Library, without what another file rendered with it",
  () => {
    const onPress = vi.fn();
    renderWithTestingLibrary(<PressButton onPress={onPress}>Toggle</PressButton>);

    // client.test.tsx renders a button of that name with Testing Library,
    // which vitest.setup.client.tsx has it take away.
    fireEvent.click(screen.getByRole("button", { name: "Toggle" }));

    expect(onPress).toHaveBeenCalledOnce();
  },
);

// Vitest runs no hook of a block, or of a file, whose tests are all skipped.
// What the plugin does around a file does not need one.
describe.skip("a block whose tests are all skipped", () => {
  test("is not run", () => {
    expect.unreachable();
  });
});
