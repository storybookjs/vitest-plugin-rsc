import { cleanup, handleRequest, renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { afterEach, beforeEach, expect, test, vi, type MockInstance } from "vitest";
import { cdp, page } from "vitest/browser";
import { cookies, headers } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import { ClientFrame } from "./components/client-frame.tsx";
import { Counter } from "./components/counter.tsx";
import { HelpDialog } from "./components/help-dialog.tsx";
import { FavoriteButton } from "./components/favorite-button.tsx";
import { RouterState } from "./components/router-state.tsx";
import { Shortcuts } from "./components/shortcuts.tsx";
import { Widget } from "./components/widget.tsx";
import { db, type Note } from "./lib/notes.ts";
import NotesPage from "./notes/page.tsx";

let consoleError: MockInstance<typeof console.error>;

beforeEach(() => {
  vi.restoreAllMocks();
  db.notes.clear();
  consoleError = vi.spyOn(console, "error");
});

afterEach(() => {
  // React reports a hydration mismatch here, and Next a failed render.
  expect(consoleError.mock.calls).toEqual([]);
});

test("server-renders a page and hydrates it", async () => {
  const { response } = await renderServer({ url: "/" });

  expect(response.status).toBe(200);
  expect(document.documentElement.lang).toBe("en");
  await expect.element(page.getByRole("heading", { name: "Home" })).toBeVisible();

  await page.getByRole("button", { name: "Count: 0" }).click();
  await expect.element(page.getByRole("button", { name: "Count: 1" })).toBeVisible();
});

test("renders a dynamic route with its metadata", async () => {
  db.notes.set("1", { id: "1", title: "Inbox triage", body: "Sort the inbox" });

  await renderServer({ url: "/notes/1" });

  await expect.element(page.getByRole("heading", { name: "Inbox triage" })).toBeVisible();
  expect(document.title).toBe("Inbox triage | Notes");
  expect(window.location.pathname).toBe("/notes/1");
});

test("navigates on the client with next/link", async () => {
  db.notes.set("1", { id: "1", title: "Inbox triage", body: "Sort the inbox" });
  await renderServer({ url: "/" });

  await page.getByRole("link", { name: "Notes", exact: true }).click();
  await expect.element(page.getByRole("heading", { name: "Notes" })).toBeVisible();
  expect(window.location.pathname).toBe("/notes");

  await page.getByRole("link", { name: "Inbox triage" }).click();
  await expect.element(page.getByText("Sort the inbox")).toBeVisible();
  expect(window.location.pathname).toBe("/notes/1");
  await expect.poll(() => document.title).toBe("Inbox triage | Notes");
});

test("shows loading.tsx while the next page waits for its data", async () => {
  db.notes.set("1", { id: "1", title: "Inbox triage", body: "Sort the inbox" });
  await renderServer({ url: "/notes" });
  let resolveNote!: (note: Note) => void;
  vi.spyOn(db, "getNote").mockReturnValue(new Promise((resolve) => (resolveNote = resolve)));

  await page.getByRole("link", { name: "Inbox triage" }).click();
  await expect.element(page.getByText("Loading note…")).toBeVisible();

  resolveNote({ id: "1", title: "Inbox triage", body: "Sort the inbox" });
  await expect.element(page.getByRole("heading", { name: "Inbox triage" })).toBeVisible();
  await expect.element(page.getByText("Loading note…")).not.toBeInTheDocument();
});

test("follows a redirect() from a page", async () => {
  const { response } = await renderServer({ url: "/old" });

  expect(response.redirected).toBe(true);
  expect(window.location.pathname).toBe("/notes");
  await expect.element(page.getByRole("heading", { name: "Notes" })).toBeVisible();
});

test("renders the not-found boundary when a page calls notFound()", async () => {
  const { response } = await renderServer({ url: "/notes/404" });

  // The route has a loading.tsx, so the response had started when the page
  // called notFound(): the status is the 200 it started with.
  expect(response.status).toBe(200);
  await expect.element(page.getByRole("heading", { name: "Nothing here" })).toBeVisible();
});

test("serves a path that is not a route with the not-found page", async () => {
  const { response } = await renderServer({ url: "/nope" });

  expect(response.status).toBe(404);
  await expect.element(page.getByRole("heading", { name: "Nothing here" })).toBeVisible();
});

test("runs a Server Action that sets a cookie, revalidates and redirects", async () => {
  await renderServer({ url: "/notes/new" });

  await page.getByRole("textbox", { name: "Title" }).fill("Plan the week");
  await page.getByRole("button", { name: "Create" }).click();

  // redirect() in the action: the router lands on the new note.
  await expect.element(page.getByRole("heading", { name: "Plan the week" })).toBeVisible();
  expect(window.location.pathname).toBe("/notes/1");
  await expect.poll(() => document.title).toBe("Plan the week | Notes");
  expect(db.notes.get("1")?.title).toBe("Plan the week");
  expect(document.cookie).toContain("last-created=1");

  // The cookie reaches the next server render.
  await page.getByRole("link", { name: "Notes", exact: true }).click();
  await expect.element(page.getByText("Last created: 1")).toBeVisible();
});

test("rerenders the page after a Server Action with bound arguments", async () => {
  db.notes.set("1", { id: "1", title: "Inbox triage", body: "" });
  db.notes.set("2", { id: "2", title: "Plan the week", body: "" });
  await renderServer({ url: "/notes" });

  await page.getByRole("button", { name: "Delete Inbox triage" }).click();

  await expect.element(page.getByRole("link", { name: "Inbox triage" })).not.toBeInTheDocument();
  await expect.element(page.getByRole("link", { name: "Plan the week" })).toBeVisible();
  expect([...db.notes.keys()]).toEqual(["2"]);
});

test("calls a Server Action from a Client Component and uses what it returns", async () => {
  db.notes.set("1", { id: "1", title: "Inbox triage", body: "" });
  await renderServer({ url: "/notes/1" });

  await page.getByRole("button", { name: "Favorite" }).click();

  await expect.element(page.getByRole("button", { name: "Favorite", pressed: true })).toBeVisible();
  expect(db.notes.get("1")?.favorite).toBe(true);
});

test("renders parallel routes", async () => {
  db.notes.set("1", { id: "1", title: "Inbox triage", body: "" });

  await renderServer({ url: "/dashboard" });

  await expect.element(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect
    .element(page.getByRole("complementary", { name: "Stats" }))
    .toHaveTextContent("1 notes");
});

test("renders a route that only has slots, as `next build` does", async () => {
  // The layout renders `children`, and nothing is there: `next build` makes no
  // `children` for a layout without a page. An implicit one would be Next's
  // default, which answers 404.
  const { response } = await renderServer({ url: "/board" });

  expect(response.status).toBe(200);
  await expect
    .element(page.getByRole("region", { name: "Team" }))
    .toHaveTextContent("Three members");
  await expect
    .element(page.getByRole("region", { name: "Activity" }))
    .toHaveTextContent("No activity yet");
});

test("shows the error boundary of a route, and recovers from it", async () => {
  // Next logs the error on the server and React logs it in the browser.
  consoleError.mockImplementation(() => {});

  const { response } = await renderServer({ url: "/broken" });
  expect(response.status).toBe(500);
  await expect.element(page.getByRole("heading", { name: "Something went wrong" })).toBeVisible();

  db.notes.set("broken", { id: "broken", title: "Back up", body: "" });
  await page.getByRole("button", { name: "Try again" }).click();
  await expect.element(page.getByRole("heading", { name: "Back up" })).toBeVisible();
  expect(consoleError).toHaveBeenCalled();
  consoleError.mockClear();
});

test("rerenders the page after a Server Action that only sets a cookie", async () => {
  await renderServer({ url: "/settings" });
  await expect.element(page.getByText("Language: en")).toBeVisible();

  await page.getByRole("button", { name: "Use Dutch" }).click();

  await expect.element(page.getByText("Language: nl")).toBeVisible();
  expect(document.cookie).toBe("language=nl");
  expect(window.location.pathname).toBe("/settings");
});

test("renders and hydrates a Client Component from a package", async () => {
  await renderServer({ url: "/settings" });

  await page.getByRole("button", { name: "Theme: light" }).click();

  await expect.element(page.getByRole("button", { name: "Theme: dark" })).toBeVisible();
  expect(document.documentElement.classList.contains("dark")).toBe(false);
  expect(document.documentElement.dataset.theme).toBe("dark");
});

test("starts every test without the cookies of the one before", async () => {
  // The Server Action test above left `last-created` behind.
  expect(document.cookie).toBe("");

  await renderServer({ url: "/notes" });
  await expect.element(page.getByRole("heading", { name: "Notes" })).toBeVisible();
  await expect.element(page.getByText(/Last created/)).not.toBeInTheDocument();
});

test("sends the cookies the test sets before it opens a page", async () => {
  document.cookie = "last-created=7";

  await renderServer({ url: "/notes" });

  await expect.element(page.getByText("Last created: 7")).toBeVisible();
});

test("keeps the CSS of a page whose module loaded while another page was there", async () => {
  await renderServer({ url: "/" });

  // The module of the page loads for this navigation, and Vite adds its CSS
  // to the document then. The module does not load again.
  await page.getByRole("link", { name: "Notice" }).click();
  const notice = page.getByText("The office is closed on Friday.");
  await expect.element(notice).toHaveStyle({ color: "rgb(0, 128, 0)" });

  await renderServer({ url: "/notice" });
  await expect.element(notice).toHaveStyle({ color: "rgb(0, 128, 0)" });
});

test("loads the page when the app navigates without its router", async () => {
  await renderServer({ url: "/" });

  await page.getByRole("link", { name: "All notes, the long way" }).click();

  await expect.element(page.getByRole("heading", { name: "Notes" })).toBeVisible();
  expect(window.location.pathname).toBe("/notes");
});

test("rejects a page load that the test leaves before the server has responded", async () => {
  // The notes page has no loading.tsx: the server sends nothing until it has
  // the notes, which do not come.
  const listNotes = vi.spyOn(db, "listNotes").mockReturnValue(new Promise(() => {}));
  const load = renderServer({ url: "/notes" });
  const left = expect(load).rejects.toThrow("The page was left before it had loaded.");
  await expect.poll(() => listNotes).toHaveBeenCalled();

  // What runs between two tests.
  await cleanup();

  await left;
});

test("does not report the render of a page that the test left before it had its data", async () => {
  // Next reports the render that goes on without its request.
  consoleError.mockImplementation(() => {});
  await renderServer({ url: "/" });
  let resolveNotes = (_: Note[]) => {};
  const listNotes = vi
    .spyOn(db, "listNotes")
    .mockReturnValue(new Promise((resolve) => (resolveNotes = resolve)));
  // An uncaught error, which would fail this test run too.
  const reportError = vi.spyOn(window, "reportError").mockImplementation(() => {});
  await page.getByRole("link", { name: "All notes, the long way" }).click();
  await expect.poll(() => listNotes).toHaveBeenCalled();

  await cleanup();
  resolveNotes([]);

  // The render goes on without its request until Next gives up on it.
  await expect
    .poll(() => consoleError.mock.calls.flat().map(String).join("\n"))
    .toContain("Expected workStore to be initialized");
  await new Promise((resolve) => setTimeout(resolve));
  consoleError.mockClear();
  expect(reportError).not.toHaveBeenCalled();
});

test("reports a navigation to another origin and stays on the page", async () => {
  await renderServer({ url: "/" });
  // An uncaught error, which would fail this test run too.
  const reportError = vi.spyOn(window, "reportError").mockImplementation(() => {});

  // Where a sign-in or a checkout sends the user.
  window.location.assign("https://example.com/checkout");

  await expect.poll(() => reportError.mock.calls).toHaveLength(1);
  expect(String(reportError.mock.calls[0]![0])).toMatch(
    "the app navigated to another origin: https://example.com/checkout",
  );
  await expect.element(page.getByRole("heading", { name: "Home" })).toBeVisible();
});

test("starts every test without what the app stored in the tab", async () => {
  // The theme test above stored its theme.
  expect(localStorage.getItem("theme")).toBeNull();

  await renderServer({ url: "/settings" });
  await expect.element(page.getByRole("button", { name: "Theme: light" })).toBeVisible();
});

test("lets go of a page that the test has left, with all of its modules", async () => {
  const tab = globalThis as { __viteRscCallServer?: object };
  await renderServer({ url: "/" });
  // A function of the page's own modules.
  const callServer = new WeakRef(tab.__viteRscCallServer!);

  await renderServer({ url: "/" });

  // Once the tasks it had queued have run.
  await expect
    .poll(
      async () => {
        await cdp().send("HeapProfiler.collectGarbage");
        // Not the function itself: the assertion would keep it.
        return callServer.deref() === undefined;
      },
      { timeout: 4000, interval: 100 },
    )
    .toBe(true);
});

test("lets go of a page that rendered a portal in the body", async () => {
  const tab = globalThis as { __viteRscCallServer?: object };
  await renderServer({ url: "/help" });
  // React adds its listeners to where a portal renders: the body.
  await page.getByRole("button", { name: "Help" }).click();
  await page.getByRole("dialog", { name: "Help" }).getByRole("button", { name: "Close" }).click();
  await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();
  // A function of the page's own modules.
  const callServer = new WeakRef(tab.__viteRscCallServer!);

  await renderServer({ url: "/" });
  // The browser keeps the element that was clicked last, and with it its
  // page, until the pointer is somewhere else.
  await page.getByRole("heading", { name: "Home" }).hover();

  await expect
    .poll(
      async () => {
        await cdp().send("HeapProfiler.collectGarbage");
        return callServer.deref() === undefined;
      },
      { timeout: 4000, interval: 100 },
    )
    .toBe(true);
});

test("lets go of a node that rendered a portal in the body", async () => {
  const tab = globalThis as { __viteRscCallServer?: object };
  // What the test has in the body stays there for the node.
  const mine = document.body.appendChild(document.createElement("aside"));
  await renderServer(<HelpDialog />);
  // Not the elements themselves: the assertion would keep them.
  expect(mine.parentElement === document.body).toBe(true);
  await page.getByRole("button", { name: "Help" }).click();
  await page.getByRole("dialog", { name: "Help" }).getByRole("button", { name: "Close" }).click();
  await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();
  // A function of the node's own modules.
  const callServer = new WeakRef(tab.__viteRscCallServer!);

  await renderServer({ url: "/" });
  await page.getByRole("heading", { name: "Home" }).hover();

  await expect
    .poll(
      async () => {
        await cdp().send("HeapProfiler.collectGarbage");
        return callServer.deref() === undefined;
      },
      { timeout: 4000, interval: 100 },
    )
    .toBe(true);
  await cleanup();
  expect(mine.parentElement).toBe(document.body);
  mine.remove();
});

test("gives the body of the document as the base element, also after the node is left", async () => {
  const result = await renderServer(<Link href="/notes">All notes</Link>, {
    baseElement: document.body,
  });
  expect(result.baseElement === document.body).toBe(true);
  expect(result.baseElement.contains(result.container)).toBe(true);

  await page.getByRole("link", { name: "All notes" }).click();

  await expect.element(page.getByRole("heading", { name: "Notes" })).toBeVisible();
  expect(result.baseElement === document.body).toBe(true);
});

test("lets go of a node that the test has left, also in a container of the test's", async () => {
  const tab = globalThis as { __viteRscCallServer?: object };
  // The test keeps this container, and React adds its listeners to it, not
  // to the document.
  const container = document.body.appendChild(document.createElement("section"));
  await renderServer(<Counter />, { container });
  // A function of the node's own modules.
  const callServer = new WeakRef(tab.__viteRscCallServer!);

  await renderServer(<Counter />);

  // The listeners that React added to the container would keep it.
  await expect
    .poll(
      async () => {
        await cdp().send("HeapProfiler.collectGarbage");
        return callServer.deref() === undefined;
      },
      { timeout: 4000, interval: 100 },
    )
    .toBe(true);
  container.remove();
});

test("removes the listeners that React added to the document", async () => {
  const added = vi.spyOn(document, "addEventListener");
  const removed = vi.spyOn(document, "removeEventListener");

  const { unmount } = await renderServer({ url: "/" });
  // One for every event React knows.
  expect(added.mock.calls.length).toBeGreaterThan(50);
  await unmount();

  expect(removed.mock.calls).toEqual(expect.arrayContaining(added.mock.calls));
});

test("keeps the listeners that the test adds while a page is open", async () => {
  await renderServer({ url: "/" });
  const listener = vi.fn();
  window.addEventListener("test-event", listener);

  await renderServer({ url: "/" });

  window.dispatchEvent(new Event("test-event"));
  window.removeEventListener("test-event", listener);
  expect(listener).toHaveBeenCalledOnce();
});

test("keeps the listeners that the app's own code adds", async () => {
  const { unmount } = await renderServer(<Shortcuts />);
  await unmount();
  const answer = vi.fn();
  window.addEventListener("shortcuts-answer", answer, { once: true });

  window.dispatchEvent(new Event("shortcuts-ask"));

  expect(answer).toHaveBeenCalledOnce();
});

test("leaves an error that the test handles to the test", async () => {
  const handle = vi.fn((event: ErrorEvent) => event.preventDefault());
  window.addEventListener("error", handle);
  const { unmount } = await renderServer({ url: "/" });
  await unmount();

  reportError(new Error("Handled by the test"));

  window.removeEventListener("error", handle);
  expect(handle).toHaveBeenCalledOnce();
  // Vitest fails the run on an error that the test has no listener for. One
  // that it has a listener for, it logs.
  expect(consoleError).toHaveBeenCalledExactlyOnceWith(
    new Error("Uncaught Error: Handled by the test"),
  );
  consoleError.mockClear();
});

test("replaces the page when a component redirects in the render after a Server Action", async () => {
  await renderServer({ url: "/members" });
  await expect.element(page.getByRole("heading", { name: "Members" })).toBeVisible();
  const entries = window.history.length;

  await page.getByRole("button", { name: "Sign in as ada" }).click();

  await expect.element(page.getByRole("heading", { name: "Account" })).toBeVisible();
  expect(window.location.pathname).toBe("/account");
  // A redirect() in a Server Action adds an entry to the history. This one is
  // in a component, so it replaces the entry of the page.
  expect(window.history.length).toBe(entries);
});

test("loads a page with the one Vite client that the tab has", async () => {
  await renderServer({ url: "/settings" });
  // Vite's client opens a websocket when it is evaluated. The tab has one.
  const WebSocket = vi.spyOn(globalThis, "WebSocket");

  await renderServer({ url: "/settings" });

  await expect.element(page.getByRole("button", { name: "Theme: light" })).toBeVisible();
  expect(WebSocket).not.toHaveBeenCalled();
  // And the tab has loaded it from one URL: another URL is another instance.
  const clients = performance
    .getEntriesByType("resource")
    .map((entry) => new URL(entry.name))
    .filter((url) => url.pathname.endsWith("/@vite/client"));
  expect(clients.map((url) => url.pathname + url.search)).toEqual(["/@vite/client"]);
});

// A node renders on its own, the way Testing Library renders a component: in
// a container, without the app's layouts.

async function RequestInfo() {
  return (
    <dl>
      <dt>Tenant</dt>
      <dd>{(await headers()).get("x-tenant")}</dd>
      <dt>Last created</dt>
      <dd>{(await cookies()).get("last-created")?.value}</dd>
    </dl>
  );
}

test("renders a node in a container, without the layouts of the app", async () => {
  const { container, baseElement, response } = await renderServer(
    <>
      <h1>Just a counter</h1>
      <Counter />
    </>,
  );

  expect(response.status).toBe(200);
  expect(baseElement).toBe(document.body);
  expect(container.parentElement).toBe(document.body);
  await expect.element(page.getByRole("heading", { name: "Just a counter" })).toBeVisible();
  expect(container.querySelector("h1")?.textContent).toBe("Just a counter");
  await expect.element(page.getByRole("navigation", { name: "Main" })).not.toBeInTheDocument();

  // Hydrated by Next's router.
  await page.getByRole("button", { name: "Count: 0" }).click();
  await expect.element(page.getByRole("button", { name: "Count: 1" })).toBeVisible();
});

test("renders a node at / when it gets no url, also where the app has a page", async () => {
  const { response } = await renderServer(<RouterState />);

  expect(new URL(response.url).pathname).toBe("/");
  expect(window.location.pathname).toBe("/");
  const router = page.getByRole("definition");
  await expect.element(router.nth(0)).toHaveTextContent("/");
  await expect.element(router.nth(1)).toHaveTextContent("{}");
  await expect.element(page.getByRole("heading", { name: "Home" })).not.toBeInTheDocument();
});

test("gives a node the params that the app's route has for its url", async () => {
  await renderServer(<RouterState />, { url: "/notes/7?q=1&q=2" });

  const router = page.getByRole("definition");
  await expect.element(router.nth(0)).toHaveTextContent("/notes/7");
  await expect.element(router.nth(1)).toHaveTextContent('{"id":"7"}');
  await expect.element(router.nth(2)).toHaveTextContent("q=1&q=2");
  // A node is where a page is: the last segment, with none below it.
  await expect.element(router.nth(3)).toHaveTextContent("[]");
  expect(window.location.pathname).toBe("/notes/7");
});

test("gives a node the params of a catch-all route, also of a route handler", async () => {
  await renderServer(<RouterState />, { url: "/api/echo/a/b" });

  await expect.element(page.getByRole("definition").nth(1)).toHaveTextContent('{"path":["a","b"]}');
});

test("gives a node the params of an optional catch-all route, with and without segments", async () => {
  // The app has `app/api/files/[[...path]]/route.ts`.
  await renderServer(<RouterState />, { url: "/api/files" });
  await expect.element(page.getByRole("definition").nth(1)).toHaveTextContent("{}");

  await renderServer(<RouterState />, { url: "/api/files/a/b" });
  await expect.element(page.getByRole("definition").nth(1)).toHaveTextContent('{"path":["a","b"]}');
});

test("renders a node at a url that is no route, without params", async () => {
  const { response } = await renderServer(<RouterState />, { url: "/nowhere/at/all?q=1" });

  expect(response.status).toBe(200);
  const router = page.getByRole("definition");
  await expect.element(router.nth(0)).toHaveTextContent("/nowhere/at/all");
  await expect.element(router.nth(1)).toHaveTextContent("{}");
  await expect.element(router.nth(2)).toHaveTextContent("q=1");
});

test("gives a node the request: its headers and cookies", async () => {
  document.cookie = "last-created=7";

  await renderServer(<RequestInfo />, { headers: { "x-tenant": "acme" } });

  await expect.element(page.getByText("acme")).toBeVisible();
  await expect.element(page.getByText("7", { exact: true })).toBeVisible();
});

test("sends a cookie header instead of the tab's cookies", async () => {
  document.cookie = "last-created=7";

  await renderServer(<RequestInfo />, { headers: { cookie: "last-created=9" } });

  await expect.element(page.getByText("9", { exact: true })).toBeVisible();
});

async function Tenant({ children }: { children: ReactNode }) {
  const tenant = (await headers()).get("x-tenant");
  return <section aria-label={`Tenant ${tenant}`}>{children}</section>;
}

test("wraps a node in a wrapper, which can be a Server Component", async () => {
  await renderServer(<Counter />, { wrapper: Tenant, headers: { "x-tenant": "acme" } });

  const tenant = page.getByRole("region", { name: "Tenant acme" });
  await tenant.getByRole("button", { name: "Count: 0" }).click();
  await expect.element(tenant.getByRole("button", { name: "Count: 1" })).toBeVisible();
});

test("wraps a node in a wrapper that is a Client Component", async () => {
  await renderServer(<Counter />, { wrapper: ClientFrame });

  const frame = page.getByRole("region", { name: "Frame" });
  await frame.getByRole("button", { name: "Count: 0" }).click();
  await expect.element(frame.getByRole("button", { name: "Count: 1" })).toBeVisible();
  // The wrapper hydrated too.
  await frame.getByRole("button", { name: "Close" }).click();
  await expect.element(frame.getByRole("button", { name: "Count: 1" })).not.toBeInTheDocument();
});

test("calls a Server Action from a node", async () => {
  db.notes.set("1", { id: "1", title: "Inbox triage", body: "" });

  await renderServer(<FavoriteButton id="1" favorite={false} />);

  await page.getByRole("button", { name: "Favorite" }).click();
  await expect.element(page.getByRole("button", { name: "Favorite", pressed: true })).toBeVisible();
  expect(db.notes.get("1")?.favorite).toBe(true);
});

test("renders a node again after a Server Action that revalidates its path", async () => {
  db.notes.set("1", { id: "1", title: "Inbox triage", body: "" });
  db.notes.set("2", { id: "2", title: "Plan the week", body: "" });
  // The page of the route, as a node: without its layouts.
  await renderServer(<NotesPage />, { url: "/notes" });
  await expect.element(page.getByRole("navigation", { name: "Main" })).not.toBeInTheDocument();

  // The action calls revalidatePath("/notes").
  await page.getByRole("button", { name: "Delete Inbox triage" }).click();

  await expect.element(page.getByRole("link", { name: "Inbox triage" })).not.toBeInTheDocument();
  await expect.element(page.getByRole("link", { name: "Plan the week" })).toBeVisible();
  expect([...db.notes.keys()]).toEqual(["2"]);
  expect(window.location.pathname).toBe("/notes");
});

test("loads the page of the app's route when a node links to it", async () => {
  const { container } = await renderServer(<Link href="/notes">All notes</Link>, {
    url: "/notes/7",
  });

  await page.getByRole("link", { name: "All notes" }).click();

  // The whole page, with its layouts: a page load, as Next's router does
  // when it leaves a route for one with another root layout.
  await expect.element(page.getByRole("heading", { name: "Notes" })).toBeVisible();
  await expect.element(page.getByRole("navigation", { name: "Main" })).toBeVisible();
  expect(window.location.pathname).toBe("/notes");
  expect(container).toBeEmptyDOMElement();
});

test("leaves the node with unmount(), and its route with it", async () => {
  const { container, unmount } = await renderServer(<h1>Not the notes</h1>, { url: "/notes" });
  await expect.element(page.getByRole("heading", { name: "Not the notes" })).toBeVisible();

  await unmount();

  expect(container).toBeEmptyDOMElement();
  expect(window.location.pathname).not.toBe("/notes");
  const response = await handleRequest("/notes");
  expect(await response.text()).toContain("<h1>Notes</h1>");
});

test("hydrates a node that renders a script, and leaves it where it is", async () => {
  const { container } = await renderServer(
    <>
      <script type="application/ld+json">{'{"@type":"Note"}'}</script>
      <Counter />
    </>,
  );

  // A script that is moved is a hydration error, which fails the test.
  await page.getByRole("button", { name: "Count: 0" }).click();
  await expect.element(page.getByRole("button", { name: "Count: 1" })).toBeVisible();
  expect(container.querySelector("script + button")).not.toBeNull();
});

test("gives the container as a fragment, without the scripts that run", async () => {
  const { asFragment } = await renderServer(
    <p>
      Hello <b>there</b>
      <script type="application/ld+json">{'{"@type":"Note"}'}</script>
    </p>,
  );

  const fragment = asFragment();
  expect(fragment.querySelector("p")?.outerHTML).toBe(
    '<p>Hello <b>there</b><script type="application/ld+json">{"@type":"Note"}</script></p>',
  );
  // Next's and React's, which carry the Flight payload.
  expect(fragment.querySelectorAll("script")).toHaveLength(1);
});

test("renders a node in a container of the test's, which it leaves in the document", async () => {
  const baseElement = document.body.appendChild(document.createElement("main"));
  const container = baseElement.appendChild(document.createElement("section"));

  const result = await renderServer(<h1>In a section</h1>, { container, baseElement });

  expect(result.container).toBe(container);
  expect(result.baseElement).toBe(baseElement);
  await expect.element(page.getByRole("heading", { name: "In a section" })).toBeVisible();
  // As in Testing Library, the container is the base element when it gets none.
  expect((await renderServer(<h1>Again</h1>, { container })).baseElement).toBe(container);
  await cleanup();
  expect(container.isConnected).toBe(true);
  expect(container).toBeEmptyDOMElement();
  baseElement.remove();
});

test("does not take a container that holds something, or the body", async () => {
  const container = document.body.appendChild(document.createElement("section"));
  container.append("The test's own");

  await expect(renderServer(<h1>Node</h1>, { container })).rejects.toThrow(
    "the container of a node has to be empty",
  );
  await expect(renderServer(<h1>Node</h1>, { container: document.body })).rejects.toThrow(
    "the container of a node cannot be the <body>",
  );

  expect(container.textContent).toBe("The test's own");
  container.remove();
});

function Redirects({ to }: { to: string }): never {
  redirect(to);
}

test("loads the page that a node redirects to while it renders", async () => {
  const { container, response } = await renderServer(<Redirects to="/notes" />, {
    url: "/old/node/url",
  });

  // The page with its layouts, as the document, and not in the container.
  expect(new URL(response.url).pathname).toBe("/notes");
  expect(window.location.pathname).toBe("/notes");
  await expect.element(page.getByRole("navigation", { name: "Main" })).toBeVisible();
  await expect.element(page.getByRole("heading", { name: "Notes" })).toBeVisible();
  expect(container).toBeEmptyDOMElement();
  // The node's route went with the node.
  expect((await handleRequest("/old/node/url")).status).toBe(404);
});

test("stops a node that redirects to its own url, as a browser does", async () => {
  // Next logs nothing for a redirect. Every one of them renders the node.
  await expect(
    renderServer(<Redirects to="/old/node/url?again" />, { url: "/old/node/url" }),
  ).rejects.toThrow(/too many redirects for .*\/old\/node\/url\. The last one was to .*\?again/);

  expect((await handleRequest("/old/node/url")).status).toBe(404);
});

test("gives the node's url back when the node does not open", async () => {
  // A route handler that answers with text, which is no page.
  await expect(
    renderServer(<Redirects to="/api/plain" />, { url: "/old/node/url" }),
  ).rejects.toThrow("which is not a page to open");

  expect((await handleRequest("/old/node/url")).status).toBe(404);
});

function Missing(): never {
  notFound();
}

test("shows Next's own not-found page for a node that calls notFound()", async () => {
  const { container, response } = await renderServer(<Missing />);

  expect(response.status).toBe(404);
  // Next sends a document for it and renders the page in the tab, as it does
  // for a route without a root layout to put it in.
  await expect.element(page.getByText("This page could not be found.")).toBeVisible();
  expect(container).toBeEmptyDOMElement();
});

test("renders the page of the app at the url a node was at", async () => {
  await renderServer(<h1>Not the home page</h1>);
  await expect.element(page.getByRole("heading", { name: "Not the home page" })).toBeVisible();

  await renderServer({ url: "/" });

  await expect.element(page.getByRole("heading", { name: "Home" })).toBeVisible();
  await expect.element(page.getByRole("navigation", { name: "Main" })).toBeVisible();
});

test("removes the container it made when the test ends", async () => {
  const { container } = await renderServer(<h1>Gone soon</h1>);

  await cleanup();

  expect(container.isConnected).toBe(false);
});

function Broken(): never {
  throw new Error("Broken node");
}

test("reports what a node throws, as Next does for a page without an error boundary", async () => {
  // Next logs the error on the server. Nothing else is logged: not a
  // hydration error either.
  consoleError.mockImplementation(() => {});
  // An uncaught error, which fails the test: what a test of a node that
  // throws gets.
  const reportError = vi.spyOn(window, "reportError").mockImplementation(() => {});

  const { container, response } = await renderServer(<Broken />);

  expect(response.status).toBe(500);
  // Next's own global error page, the one boundary of a node. It is a
  // document of its own, so it is not in the container.
  await expect
    .element(page.getByRole("heading", { name: "This page couldn’t load" }))
    .toBeVisible();
  expect(container).toBeEmptyDOMElement();
  expect(reportError).toHaveBeenCalledWith(expect.objectContaining({ message: "Broken node" }));
  expect(consoleError.mock.calls.map(([error]) => String(error))).toEqual(["Error: Broken node"]);
  consoleError.mockClear();
});

test("leaves the node when a Client Component makes a React root of its own", async () => {
  const { unmount } = await renderServer(<Widget />);
  await expect.element(page.getByText("Widget")).toBeVisible();
  const widgetUnmount = vi.fn();
  window.addEventListener("widget-unmount", widgetUnmount);

  await unmount();

  window.removeEventListener("widget-unmount", widgetUnmount);
  expect(widgetUnmount).toHaveBeenCalledOnce();
});
