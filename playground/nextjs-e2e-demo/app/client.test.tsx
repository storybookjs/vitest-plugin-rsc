"use client";

import { fireEvent, render as renderWithTestingLibrary, screen } from "@testing-library/react";
import Link from "next/link";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { Component, useState, version, type ReactNode } from "react";
import {
  afterEach,
  beforeEach,
  expect,
  inject,
  onTestFinished,
  test,
  vi,
  type MockInstance,
} from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { cleanup, renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { linkedStylesheets, renderedContainers } from "../test/browser.ts";
import { Locale } from "./components/locale.tsx";
import { localeSets } from "./lib/locale.ts";
import { PressButton } from "./components/press-button.tsx";
import { toggleFavorite } from "./lib/actions.ts";
import { buildOf } from "./lib/build.ts";
import { countPresses, pressed } from "./lib/presses.ts";
import { ClientCard } from "./styles/client-card.tsx";

// A test file with `"use client"` is a client boundary, as a file with that
// directive is in React: code of the browser layer. It renders a Client
// Component with vitest-browser-react or Testing Library, without the app of
// Next around it. A connected component, with its data from the server, is
// for `renderServer()` in a test file without the directive. The setup of
// the browser layer is in vitest.setup.client.tsx, a setup file with the
// directive.

// React's production build has no `act()`. Without it `render()` of
// vitest-browser-react resolves before React has rendered, so a test finds
// what it rendered with a locator, which waits. Testing Library renders with
// `act()`, and so needs the development build.
const build = inject("build");

let consoleError: MockInstance<typeof console.error>;

beforeEach(() => {
  vi.restoreAllMocks();
  consoleError = vi.spyOn(console, "error");
  // What vitest-browser-react rendered before, in this file or another one:
  // see client-cleanup.test.tsx.
  expect(renderedContainers()).toEqual([]);
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

test("has what the setup file with the directive set up for the browser layer", async () => {
  // vitest.setup.client.tsx imports test/setup-locale.tsx, which set the
  // locale in the graph of the tab: once, as a module loads once, also
  // though Vitest runs the setup file before every test file. A page of
  // `renderServer()` starts without it: see node.test.tsx.
  const { getByText } = await render(<Locale />);

  await expect.element(getByText("Locale: nl")).toBeVisible();
  expect(localeSets()).toBe(1);
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
  // client-cleanup.test.tsx renders a button of that name with Testing
  // Library too, which vitest.setup.client.tsx has it take away before this.
  renderWithTestingLibrary(<Toggle />);

  fireEvent.click(screen.getByRole("button", { name: "Toggle" }));

  expect(screen.getByRole("button", { name: "Toggle" }).getAttribute("aria-pressed")).toBe("true");
});

test("links the CSS of a Client Component that this file imports, and none of another file", async () => {
  const { getByText } = await render(<ClientCard />);
  const card = await getByText("Styled by a CSS module in a Client Component").findElement();

  // Linked before the tests of the file run.
  expect(getComputedStyle(card).color).toBe("rgb(128, 0, 0)");
  expect(linkedStylesheets()).toContainEqual(expect.stringContaining("client-card.module.css"));
  // That of the badge that client-cleanup.test.tsx imports went with it.
  expect(linkedStylesheets()).not.toContainEqual(expect.stringContaining("client-badge.css"));
});

// The CSS of a file with "use client" is the host's for as long as it uses
// the file: `cleanup()` unlinks it, and the plugin's setup file links that of
// the setup files and the test file again before the next test.
test("unlinks the CSS of this file with cleanup()", async () => {
  expect(linkedStylesheets()).toContainEqual(expect.stringContaining("client-card.module.css"));

  await cleanup();

  expect(linkedStylesheets()).not.toContainEqual(expect.stringContaining("client-card.module.css"));
});

test("links the CSS of this file again for the test after a cleanup()", async () => {
  const { getByText } = await render(<ClientCard />);

  await expect
    .element(getByText("Styled by a CSS module in a Client Component"))
    .toHaveStyle({ color: "rgb(128, 0, 0)" });
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
      "a component called the Server Action toggleFavorite, and no page of the app is open",
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

test("has null for what the hooks of Next's router read of the URL, which is not there", async () => {
  let read: unknown;
  function ReadsTheUrl() {
    read = { pathname: usePathname(), searchParams: useSearchParams(), params: useParams() };
    return null;
  }

  await render(<ReadsTheUrl />);

  await expect.poll(() => read).toEqual({ pathname: null, searchParams: null, params: null });
});

test("says that a link cannot navigate without Next's router, and stays", async () => {
  // An uncaught error, which would fail this test run too.
  const reportError = vi.spyOn(window, "reportError").mockImplementation(() => {});
  const { getByRole } = await render(<Link href="/notes">Notes</Link>);

  // Without its router, Next's `<Link>` leaves the navigation to the browser.
  await getByRole("link", { name: "Notes" }).click();

  await expect.poll(() => reportError.mock.calls).toHaveLength(1);
  const error = String(reportError.mock.calls[0]![0]);
  expect(error).toMatch(`navigated to ${location.origin}/notes`);
  expect(error).toMatch('a test file with "use client" has none');
  await expect.element(getByRole("link", { name: "Notes" })).toBeVisible();
});

test("leaves a download that a link declares to the browser, and stays", async () => {
  const reportError = vi.spyOn(window, "reportError").mockImplementation(() => {});
  const { getByRole } = await render(
    <a href="/host.json" download>
      Host as JSON
    </a>,
  );

  await getByRole("link", { name: "Host as JSON" }).click();

  await expect.element(getByRole("link", { name: "Host as JSON" })).toBeVisible();
  expect(reportError).not.toHaveBeenCalled();
});

// As in a browser without the app, as with Testing Library: the requests go
// to the network, and the cookies and the storage are the origin's, which
// another document of it, like Vitest's UI, shares.
test("has the browser's own fetch, cookies and storage", async () => {
  onTestFinished(() => {
    localStorage.removeItem("client-test");
    document.cookie = "client-test=; max-age=0";
  });
  localStorage.setItem("client-test", "stored");
  document.cookie = "client-test=set";
  const frame = document.body.appendChild(document.createElement("iframe"));
  onTestFinished(() => frame.remove());
  const other = frame.contentWindow!;

  expect(Object.getPrototypeOf(localStorage)).toBe(Storage.prototype);
  expect(Object.hasOwn(document, "cookie")).toBe(false);
  expect("cookieStore" in window).toBe(true);
  expect(Function.prototype.toString.call(fetch)).toContain("[native code]");
  expect(other.localStorage.getItem("client-test")).toBe("stored");
  expect(other.document.cookie).toContain("client-test=set");
  // A route handler of the app is not there: a request to the origin goes
  // to the dev server.
  expect((await fetch("/api/export")).headers.get("content-disposition")).toBeNull();
});

test("says that a form cannot navigate without Next's router either", async () => {
  const reportError = vi.spyOn(window, "reportError").mockImplementation(() => {});
  const { getByRole } = await render(
    <form action="/search">
      <input name="q" defaultValue="notes" aria-label="Query" />
      <button>Search</button>
    </form>,
  );

  await getByRole("button", { name: "Search" }).click();

  await expect.poll(() => reportError.mock.calls).toHaveLength(1);
  expect(String(reportError.mock.calls[0]![0])).toMatch(
    `navigated to ${location.origin}/search?q=notes`,
  );
  await expect.element(getByRole("textbox", { name: "Query" })).toHaveValue("notes");
});
