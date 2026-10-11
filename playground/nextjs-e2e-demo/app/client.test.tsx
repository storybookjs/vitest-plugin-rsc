"use client";

import { cleanup, renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { afterEach, beforeEach, expect, inject, test, vi, type MockInstance } from "vitest";
import { cdp, page } from "vitest/browser";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, use, useState, type ReactNode } from "react";
import { Counter } from "./components/counter.tsx";
import { PressButton } from "./components/press-button.tsx";
import { RouterState } from "./components/router-state.tsx";
import { toggleFavorite } from "./lib/actions.ts";
import { countPresses, pressed } from "./lib/presses.ts";
import { buildOf } from "./lib/build.ts";
import { ClientCard } from "./styles/client-card.tsx";
import { fileChanged, transformsOf } from "../test/service.ts";

// A test file with `"use client"` is code of the browser layer, as such a
// file is in Next. Its nodes render in the browser and not on the server: a
// prop can be a function, and a component of this file can have state.

let consoleError: MockInstance<typeof console.error>;

beforeEach(() => {
  vi.restoreAllMocks();
  consoleError = vi.spyOn(console, "error");
});

afterEach(() => {
  expect(consoleError.mock.calls).toEqual([]);
});

function Presses({ label }: { label: string }) {
  const [count, setCount] = useState(0);
  return (
    <PressButton onPress={() => setCount(pressed())}>
      {label}: {count}
    </PressButton>
  );
}

test("is not server code", () => {
  expect(typeof window).toBe("object");
});

// The `build` option of the plugin, which CI runs this file with each of.
test("runs the build of React that the plugin is set to, as the page does", async () => {
  const { container } = await renderServer(<p>Rendered</p>);

  // An element of this file, of its JSX for that build, and a fiber of the
  // page's React DOM, whose development build keeps on it who rendered it.
  const [, fiber] = Object.entries(container.querySelector("p")!).find(([key]) =>
    key.startsWith("__reactFiber$"),
  )!;
  expect({
    react: buildOf(<i />),
    reactDom: "_debugOwner" in fiber ? "development" : "production",
  }).toEqual({ react: inject("build"), reactDom: inject("build") });
});

test("passes a function to a Client Component, which calls it", async () => {
  const onPress = vi.fn();

  const { container, response } = await renderServer(
    <PressButton onPress={onPress}>Press</PressButton>,
  );

  expect(response.status).toBe(200);
  // The node is there once `renderServer()` resolves. The server did not render it.
  expect(container.querySelector("button")?.textContent).toBe("Press");
  expect(await response.text().catch(() => "read")).toBe("read");
  await page.getByRole("button", { name: "Press" }).click();
  expect(onPress).toHaveBeenCalledOnce();
  expect(onPress.mock.calls[0]![0].type).toBe("click");
  expect(onPress.mock.calls[0]![0].currentTarget).toBe(null);
});

test("renders a component of the test file, with state", async () => {
  await renderServer(<Presses label="Presses" />);

  await page.getByRole("button", { name: "Presses: 0" }).click();
  await page.getByRole("button", { name: "Presses: 1" }).click();
  await expect.element(page.getByRole("button", { name: "Presses: 2" })).toBeVisible();
  // The module the page calls is the one this file imports.
  expect(countPresses()).toBe(2);
});

test("starts every test with a page of its own, and with its modules", async () => {
  expect(countPresses()).toBe(0);

  await renderServer(<Presses label="Presses" />);

  await page.getByRole("button", { name: "Presses: 0" }).click();
  await expect.element(page.getByRole("button", { name: "Presses: 1" })).toBeVisible();
  expect(countPresses()).toBe(1);
});

function Where() {
  const pathname = usePathname();
  const router = useRouter();
  return (
    <>
      <p>At {pathname}</p>
      <button onClick={() => router.push(`${pathname}?tab=2`)}>Second tab</button>
    </>
  );
}

test("renders the node in Next's app, at the url of the request", async () => {
  await renderServer(
    <>
      <Where />
      <RouterState />
    </>,
    { url: "/notes/7?q=1" },
  );

  await expect.element(page.getByText("At /notes/7")).toBeVisible();
  const router = page.getByRole("definition");
  await expect.element(router.nth(0)).toHaveTextContent("/notes/7");
  await expect.element(router.nth(1)).toHaveTextContent('{"id":"7"}');
  await expect.element(router.nth(2)).toHaveTextContent("q=1");
  expect(window.location.pathname).toBe("/notes/7");

  // A navigation of Next's router that stays with the node.
  await page.getByRole("button", { name: "Second tab" }).click();
  await expect.element(router.nth(2)).toHaveTextContent("tab=2");
  await expect.element(page.getByText("At /notes/7")).toBeVisible();
});

const Theme = createContext("light");

function Themed() {
  return <p>Theme: {use(Theme)}</p>;
}

function Dark({ children }: { children: ReactNode }) {
  return <Theme value="dark">{children}</Theme>;
}

// As for a test file of the server: a node has the CSS of what the test file
// imports, here in the browser layer.
test("links the CSS of a Client Component that this file imports", async () => {
  await renderServer(<ClientCard />);

  await expect
    .element(page.getByText("Styled by a CSS module in a Client Component"))
    .toHaveStyle({ color: "rgb(128, 0, 0)" });
});

test("wraps the node in a wrapper, in the browser", async () => {
  await renderServer(<Themed />, { wrapper: Dark });

  await expect.element(page.getByText("Theme: dark")).toBeVisible();
});

test("renders the node in the layouts of a route, with `layouts`", async () => {
  const onPress = vi.fn();

  await renderServer(<PressButton onPress={onPress}>Press</PressButton>, {
    url: "/notes",
    layouts: true,
  });

  await expect.element(page.getByRole("navigation", { name: "Main" })).toBeVisible();
  await page.getByRole("main").getByRole("button", { name: "Press" }).click();
  expect(onPress).toHaveBeenCalledOnce();
  // Not the page of the route.
  await expect.element(page.getByRole("heading", { name: "Notes" })).not.toBeInTheDocument();
});

test("sends the headers of the node with every request after it, as for a node of the server", async () => {
  await renderServer(<PressButton onPress={() => {}}>Press</PressButton>, {
    headers: { "x-client": "test" },
  });

  // This file cannot seed the server's notes: its `db` is a copy of the browser layer's.
  const body = JSON.stringify({ title: "With headers" });
  expect((await fetch("/api/notes/client-headers", { method: "PUT", body })).status).toBe(200);
  expect(await (await fetch("/api/notes/client-headers")).json()).toMatchObject({ client: "test" });
  const own = await fetch("/api/notes/client-headers", { headers: { "x-client": "own" } });
  expect(await own.json()).toMatchObject({ client: "own" });
});

function Favorite({ id }: { id: string }) {
  const [favorite, setFavorite] = useState<boolean>();
  return (
    <button onClick={async () => setFavorite(await toggleFavorite(id))}>
      Favorite: {String(favorite)}
    </button>
  );
}

test("calls a Server Action from a component of this file", async () => {
  await renderServer(<Favorite id="client-action" />);
  // The server's notes, through a route handler: see the test above.
  const body = JSON.stringify({ title: "A favorite" });
  expect((await fetch("/api/notes/client-action", { method: "PUT", body })).status).toBe(200);

  await page.getByRole("button", { name: "Favorite: undefined" }).click();

  await expect.element(page.getByRole("button", { name: "Favorite: true" })).toBeVisible();
  const { note } = await (await fetch("/api/notes/client-action")).json();
  expect(note).toMatchObject({ title: "A favorite", favorite: true });
});

test("opens a page of the app, as a test file of the server does", async () => {
  const { response } = await renderServer({ url: "/" });

  expect(response.status).toBe(200);
  await expect.element(page.getByRole("heading", { name: "Home" })).toBeVisible();
  await page.getByRole("button", { name: "Count: 0" }).click();
  await expect.element(page.getByRole("button", { name: "Count: 1" })).toBeVisible();
});

test("leaves the node for a page of the app when a link goes there", async () => {
  await renderServer(
    <>
      <Presses label="Presses" />
      <Link href="/notes">All notes</Link>
    </>,
  );
  await page.getByRole("button", { name: "Presses: 0" }).click();

  await page.getByRole("link", { name: "All notes" }).click();

  await expect.element(page.getByRole("heading", { name: "Notes" })).toBeVisible();
  await expect.element(page.getByRole("navigation", { name: "Main" })).toBeVisible();
  expect(window.location.pathname).toBe("/notes");
  // The page that loaded has its own modules, and this file has those now.
  expect(countPresses()).toBe(0);
});

test("renders a node after a page of the app", async () => {
  await renderServer({ url: "/notes" });
  await expect.element(page.getByRole("heading", { name: "Notes" })).toBeVisible();
  const { unmount } = await renderServer(<Presses label="After a page" />);
  await page.getByRole("button", { name: "After a page: 0" }).click();
  await expect.element(page.getByRole("button", { name: "After a page: 1" })).toBeVisible();

  // And a node after a node, once that one is left.
  await unmount();
  expect(countPresses()).toBe(0);
  await renderServer(<Presses label="After a node" />);
  await page.getByRole("button", { name: "After a node: 0" }).click();
  await expect.element(page.getByRole("button", { name: "After a node: 1" })).toBeVisible();
});

test("lets go of the page of a node, with the modules this file read from it", async () => {
  await renderServer(<Presses label="Presses" />);
  await page.getByRole("button", { name: "Presses: 0" }).click();
  const modules = new WeakRef(
    (globalThis as { __viteRscCallServer?: object }).__viteRscCallServer!,
  );

  await renderServer({ url: "/" });
  // The browser keeps the element that was clicked last until the pointer is
  // somewhere else.
  await page.getByRole("heading", { name: "Home" }).hover();

  await expect
    .poll(
      async () => {
        await cdp().send("HeapProfiler.collectGarbage");
        return modules.deref() === undefined;
      },
      { timeout: 4000, interval: 100 },
    )
    .toBe(true);
});

test("says so for a node that was made with the components of the page it replaces", async () => {
  await renderServer(<Counter />);

  // `Counter` is read here, while the page of the first node is open.
  await expect(renderServer(<Counter />)).rejects.toThrow(
    "the node has a component of the page that is open, Counter",
  );
  // A component of this file is no module of the page.
  await renderServer(<Themed />);
  await expect.element(page.getByText("Theme: light")).toBeVisible();
});

test("waits for the node where the route shows its loading state first, with `layouts`", async () => {
  // `/notes/7` has a `loading.tsx`, whose boundary hydrates after the page.
  await renderServer(<PressButton onPress={vi.fn()}>Press</PressButton>, {
    url: "/notes/7",
    layouts: true,
  });

  expect(document.querySelector("main button")?.textContent).toBe("Press");
});

test("takes back what a module that the file imports while a page is open left behind", async () => {
  await renderServer(<Themed />);
  // A module of the page that is open, which listens on `window`.
  const { message, timesHeard } = await import("./lib/listens.ts");

  await cleanup();
  window.postMessage(message, "*");
  await new Promise((resolve) => setTimeout(resolve, 100));

  // The page is gone, and its listener with it.
  expect(timesHeard()).toBe(0);
});

test("loads what this file imports as the dev server has it now, for the next page", async () => {
  await renderServer(<Counter />);
  // For the browser layer only. The server layer, which the tab loads once,
  // would ask the dev server for every module from then on, which
  // page-load.test.tsx asserts it does not before its own change.
  await fileChanged("app/components/counter.tsx", "react_client");
  const transforms = await transformsOf("app/components/counter.tsx");

  // The next page has a module graph of its own, with `Counter` in it.
  await cleanup();

  expect(await transformsOf("app/components/counter.tsx")).toBeGreaterThan(transforms);
});
