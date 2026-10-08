import { cleanup, handleRequest, renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { afterEach, beforeEach, expect, onTestFinished, test, vi, type MockInstance } from "vitest";
import { page } from "vitest/browser";
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

test("follows a redirect() of a response that had started, once", async () => {
  await renderServer({ url: "/" });

  // The route has a loading.tsx, so the response has started when the page
  // calls redirect(). Next's router does the redirect, with a page load.
  window.location.assign("/moved");
  await expect.element(page.getByRole("heading", { name: "Notes" })).toBeVisible();
  expect(window.location.pathname).toBe("/notes");

  // Next also sends a `<meta http-equiv="refresh">`, for a browser without
  // JavaScript. It is due a second later, when the page it was for is gone.
  const body = document.body;
  await new Promise((resolve) => setTimeout(resolve, 1500));
  expect(document.body).toBe(body);
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

test("has the URL of the page when an inline script of the page runs", async () => {
  await renderServer({ url: "/script/location" });

  expect((window as { loadedAt?: string }).loadedAt).toBe("/script/location");
});

test("answers a request for the not-found page itself with a 404", async () => {
  expect((await handleRequest("/_not-found")).status).toBe(404);
});

test("uploads a file to a Server Action, with a name that is not ASCII", async () => {
  await renderServer({ url: "/upload" });
  const files = new DataTransfer();
  // The UTF-8 of `テ` has bytes that are no latin1 character in a browser.
  files.items.add(new File(["hello"], "hello你好テスト.txt", { type: "text/plain" }));
  (page.getByLabelText("File").element() as HTMLInputElement).files = files.files;

  await page.getByRole("button", { name: "Upload" }).click();

  await expect.poll(() => db.notes.get("hello你好テスト.txt")?.body).toBe("hello");
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
    .toContain("`cookies` was called outside a request scope");
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

test("keeps what Vitest stores in the tab while the tests run", async () => {
  // The dark mode of Vitest's UI may be set already: it is the developer's.
  const colorScheme = localStorage.getItem("vueuse-color-scheme");
  onTestFinished(() => {
    localStorage.removeItem("vitest-ui_test-setting");
    if (colorScheme === null) localStorage.removeItem("vueuse-color-scheme");
    else localStorage.setItem("vueuse-color-scheme", colorScheme);
  });
  // Like the settings of Vitest's UI, which it stores when they change.
  localStorage.setItem("vitest-ui_test-setting", "on");
  localStorage.setItem("vueuse-color-scheme", colorScheme ?? "auto");

  await cleanup();

  expect(localStorage.getItem("vitest-ui_test-setting")).toBe("on");
  expect(localStorage.getItem("vueuse-color-scheme")).toBe(colorScheme ?? "auto");
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
