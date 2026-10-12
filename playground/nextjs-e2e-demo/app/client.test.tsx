"use client";

import { fireEvent, render as renderWithTestingLibrary, screen } from "@testing-library/react";
import { useRouter } from "next/navigation";
import { Component, useState, version, type ReactNode } from "react";
import { afterEach, beforeEach, expect, inject, test, vi, type MockInstance } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { PressButton } from "./components/press-button.tsx";
import { toggleFavorite } from "./lib/actions.ts";
import { buildOf } from "./lib/build.ts";
import { countPresses, pressed } from "./lib/presses.ts";
import { ClientCard } from "./styles/client-card.tsx";

// A test file with `"use client"` is a client boundary, as a file with that
// directive is in React: code of the browser layer. It renders a Client
// Component with vitest-browser-react or Testing Library, without the app of
// Next around it. A connected component, with its data from the server, is
// for `renderServer()` in a test file without the directive.

// React's production build has no `act()`. Without it `render()` of
// vitest-browser-react resolves before React has rendered, so a test finds
// what it rendered with a locator, which waits. Testing Library renders with
// `act()`, and so needs the development build.
const build = inject("build");

let consoleError: MockInstance<typeof console.error>;

beforeEach(() => {
  vi.restoreAllMocks();
  consoleError = vi.spyOn(console, "error");
});

afterEach(() => {
  expect(consoleError.mock.calls).toEqual([]);
});

test("runs in the browser layer, on the React that Next has for the browser", async () => {
  // Not the `react` of the app: Next comes with a React of its own.
  expect(version).toBe(inject("nextReact"));

  const { getByText } = await render(<p>Rendered</p>);

  // The build of that React that the plugin is set to, which CI runs this
  // file with each of: of the JSX of this file, and of the React DOM that
  // vitest-browser-react renders with, whose development build keeps on a
  // fiber who rendered it.
  const [, fiber] = Object.entries(await getByText("Rendered").findElement()).find(([key]) =>
    key.startsWith("__reactFiber$"),
  )!;
  expect({
    react: buildOf(<i />),
    reactDom: "_debugOwner" in fiber ? "development" : "production",
  }).toEqual({ react: build, reactDom: build });
});

test("passes a spy to a Client Component, which calls it", async () => {
  const onPress = vi.fn();

  const { getByRole } = await render(<PressButton onPress={onPress}>Press</PressButton>);

  await getByRole("button", { name: "Press" }).click();
  expect(onPress).toHaveBeenCalledOnce();
  expect(onPress.mock.calls[0]![0].type).toBe("click");
});

test("shares the test runner of the tab, also with the library that renders", async () => {
  // `expect` is the tab's own, which knows the test that runs: not a copy of
  // the browser layer.
  expect(expect.getState().currentTestName).toBe(
    "shares the test runner of the tab, also with the library that renders",
  );
  // vitest-browser-react extends the `page` of the tab, which this file has.
  expect(page).toHaveProperty("render");
});

function Presses({ label }: { label: string }) {
  const [count, setCount] = useState(0);
  return (
    <PressButton onPress={() => setCount(pressed())}>
      {label}: {count}
    </PressButton>
  );
}

test("renders a component of the test file, with state", async () => {
  const before = countPresses();

  await render(<Presses label="Presses" />);

  await page.getByRole("button", { name: "Presses: 0" }).click();
  await page.getByRole("button", { name: /Presses: \d/ }).click();
  await expect
    .element(page.getByRole("button", { name: /Presses: \d/ }))
    .toHaveTextContent(`Presses: ${before + 2}`);
  // The module that the component calls is the one this file imports.
  expect(countPresses()).toBe(before + 2);
});

function Toggle() {
  const [on, setOn] = useState(false);
  return (
    <button aria-pressed={on} onClick={() => setOn(!on)}>
      Toggle
    </button>
  );
}

test.skipIf(build === "production")("renders with Testing Library", () => {
  renderWithTestingLibrary(<Toggle />);

  fireEvent.click(screen.getByRole("button", { name: "Toggle" }));

  expect(screen.getByRole("button", { name: "Toggle" }).getAttribute("aria-pressed")).toBe("true");
});

test("links the CSS of a Client Component that this file imports", async () => {
  const { getByText } = await render(<ClientCard />);
  const card = await getByText("Styled by a CSS module in a Client Component").findElement();

  // Linked before the tests of the file run.
  expect(getComputedStyle(card).color).toBe("rgb(128, 0, 0)");
});

test("says that renderServer() renders on the server, which client code cannot", async () => {
  await expect(renderServer(<PressButton onPress={vi.fn()}>Press</PressButton>)).rejects.toThrow(
    'renderServer() renders on the server, and this test file has "use client"',
  );
});

function Favorite() {
  const [error, setError] = useState<string>();
  return (
    <>
      <button
        onClick={() => toggleFavorite("1").catch((thrown: Error) => setError(thrown.message))}
      >
        Favorite
      </button>
      {error && <p role="alert">{error}</p>}
    </>
  );
}

test("says that a Server Action needs Next's app", async () => {
  await render(<Favorite />);

  await page.getByRole("button", { name: "Favorite" }).click();

  await expect
    .element(page.getByRole("alert"))
    .toMatchTextContent(
      'a component called the Server Action toggleFavorite in a test file with "use client"',
    );
});

class Boundary extends Component<{ children: ReactNode }, { error?: Error }> {
  override state: { error?: Error } = {};

  static getDerivedStateFromError(error: Error): { error: Error } {
    return { error };
  }

  override render(): ReactNode {
    return this.state.error ? <p role="alert">{this.state.error.message}</p> : this.props.children;
  }
}

function Back() {
  const router = useRouter();
  return <button onClick={() => router.back()}>Back</button>;
}

test("has Next's own error for a hook of its router, which is not there", async () => {
  // React reports an error that a boundary caught with `console.error`.
  await render(
    <Boundary>
      <Back />
    </Boundary>,
    { createRootOptions: { onCaughtError() {} } },
  );

  await expect
    .element(page.getByRole("alert"))
    .toHaveTextContent("invariant expected app router to be mounted");
});
