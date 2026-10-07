import { handleRequest, renderServer } from "vitest-plugin-rsc/nextjs";
import { afterEach, beforeEach, expect, test, vi, type MockInstance } from "vitest";
import { page } from "vitest/browser";
import { cookies, headers } from "next/headers";
import { Counter } from "./components/counter.tsx";
import { FavoriteButton } from "./components/favorite-button.tsx";
import { db, type Note } from "./lib/notes.ts";

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

test("streams a page behind its loading.tsx", async () => {
  let resolveNote!: (note: Note) => void;
  vi.spyOn(db, "getNote").mockReturnValue(new Promise((resolve) => (resolveNote = resolve)));

  // The document arrives in parts: what the server has, then the page.
  await renderServer({ url: "/notes/1" });
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

test("loads the page when the app navigates without its router", async () => {
  await renderServer({ url: "/" });

  await page.getByRole("link", { name: "All notes, the long way" }).click();

  await expect.element(page.getByRole("heading", { name: "Notes" })).toBeVisible();
  expect(window.location.pathname).toBe("/notes");
});

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

test("renders a node in place of the page of a route", async () => {
  const { response } = await renderServer(
    <>
      <h1>Just a counter</h1>
      <Counter />
    </>,
    { url: "/notes" },
  );

  expect(response.status).toBe(200);
  expect(window.location.pathname).toBe("/notes");
  // The layouts of the route are there, its page is not.
  await expect.element(page.getByRole("navigation", { name: "Main" })).toBeVisible();
  await expect.element(page.getByRole("heading", { name: "Just a counter" })).toBeVisible();
  await expect.element(page.getByRole("heading", { name: "Notes" })).not.toBeInTheDocument();

  await page.getByRole("button", { name: "Count: 0" }).click();
  await expect.element(page.getByRole("button", { name: "Count: 1" })).toBeVisible();
});

test("renders a node at / when it gets no url", async () => {
  await renderServer(<h1>On its own</h1>);

  expect(window.location.pathname).toBe("/");
  await expect.element(page.getByRole("heading", { name: "On its own" })).toBeVisible();
  await expect.element(page.getByRole("heading", { name: "Home" })).not.toBeInTheDocument();
});

test("gives a node the request: its headers and cookies", async () => {
  document.cookie = "last-created=7";

  await renderServer(<RequestInfo />, { url: "/notes", headers: { "x-tenant": "acme" } });

  await expect.element(page.getByText("acme")).toBeVisible();
  await expect.element(page.getByText("7", { exact: true })).toBeVisible();
});

test("calls a Server Action from a node", async () => {
  db.notes.set("1", { id: "1", title: "Inbox triage", body: "" });

  await renderServer(<FavoriteButton id="1" favorite={false} />, { url: "/notes/1" });

  await page.getByRole("button", { name: "Favorite" }).click();
  await expect.element(page.getByRole("button", { name: "Favorite", pressed: true })).toBeVisible();
  expect(db.notes.get("1")?.favorite).toBe(true);
});

test("sends a cookie header instead of the tab's cookies", async () => {
  document.cookie = "last-created=7";

  await renderServer(<RequestInfo />, { url: "/notes", headers: { cookie: "last-created=9" } });

  await expect.element(page.getByText("9", { exact: true })).toBeVisible();
});

test("renders a node in the slot that has the page of a route", async () => {
  await renderServer({ url: "/dashboard/details" });
  await expect.element(page.getByText("Details of the stats")).toBeVisible();

  await renderServer(<p>Just the slot</p>, { url: "/dashboard/details" });

  await expect.element(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect.element(page.getByText("Just the slot")).toBeVisible();
  await expect.element(page.getByText("Details of the stats")).not.toBeInTheDocument();
});

test("leaves the page with unmount(), and the node that stood in for it", async () => {
  const { unmount } = await renderServer(<h1>Not the notes</h1>, { url: "/notes" });
  await expect.element(page.getByRole("heading", { name: "Not the notes" })).toBeVisible();

  await unmount();

  await expect
    .element(page.getByRole("heading", { name: "Not the notes" }))
    .not.toBeInTheDocument();
  const response = await handleRequest("/notes");
  expect(await response.text()).toContain("<h1>Notes</h1>");
});

test("starts every test without what the app stored in the tab", async () => {
  // The theme test above stored its theme.
  expect(localStorage.getItem("theme")).toBeNull();

  await renderServer({ url: "/settings" });
  await expect.element(page.getByRole("button", { name: "Theme: light" })).toBeVisible();
});

test("renders the page again once a test renders the route itself", async () => {
  await renderServer(<h1>Not the notes</h1>, { url: "/notes" });
  await expect.element(page.getByRole("heading", { name: "Not the notes" })).toBeVisible();

  await renderServer({ url: "/notes" });
  await expect.element(page.getByRole("heading", { name: "Notes" })).toBeVisible();
});

test("renders the not-found page for a node at a url that is not a route", async () => {
  const { response } = await renderServer(<h1>Nowhere</h1>, { url: "/nope" });

  expect(response.status).toBe(404);
  await expect.element(page.getByRole("heading", { name: "Nothing here" })).toBeVisible();
  await expect.element(page.getByRole("heading", { name: "Nowhere" })).not.toBeInTheDocument();
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
