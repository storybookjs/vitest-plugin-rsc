import {
  cleanup,
  handleRequest,
  newBrowserContext,
  renderServer,
} from "vitest-plugin-rsc/nextjs/testing-library";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  inject,
  onTestFinished,
  test,
  vi,
  type MockInstance,
} from "vitest";
import { page } from "vitest/browser";
import { db, type Note } from "./lib/notes.ts";

let consoleError: MockInstance<typeof console.error>;
// As a module of the test takes it when it loads, outside a browser context
// of the app.
const storageAtImport = localStorage;

beforeEach(() => {
  vi.restoreAllMocks();
  db.notes.clear();
  consoleError = vi.spyOn(console, "error");
});

afterEach(() => {
  const errors = [...consoleError.mock.calls];
  // Not for the test files that run after this one, in the same browser: a
  // spy on `WebSocket` hides the websocket of the plugin from page-load.test.
  vi.restoreAllMocks();
  // React reports a hydration mismatch here, and Next a failed render.
  expect(errors).toEqual([]);
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
  const getNote = vi.spyOn(db, "getNote");
  await renderServer({ url: "/notes" });
  // Next's production code prefetches the note as its link comes into view,
  // which reads it for its metadata. The server handles one request at a
  // time, so a prefetch that waits for the note would hold up the navigation.
  if (inject("build") === "production") {
    await expect.poll(() => getNote, { timeout: 5000 }).toHaveBeenCalled();
  }
  let resolveNote!: (note: Note) => void;
  getNote.mockReturnValue(new Promise((resolve) => (resolveNote = resolve)));

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
  expect(document.cookie).toBe("last-created=1");

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

  const { response, errors } = await renderServer({ url: "/broken" });
  expect(response.status).toBe(500);
  await expect.element(page.getByRole("heading", { name: "Something went wrong" })).toBeVisible();
  // What the page reported, which it resolves with. React's production
  // build reports an error of the server by its digest.
  const failed = expect.objectContaining({
    message:
      inject("build") === "development"
        ? "The database is down"
        : expect.stringContaining("Minified React error #441"),
  });
  expect(errors).toEqual([failed]);

  db.notes.set("broken", { id: "broken", title: "Back up", body: "" });
  await page.getByRole("button", { name: "Try again" }).click();
  await expect.element(page.getByRole("heading", { name: "Back up" })).toBeVisible();
  expect(errors).toEqual([failed]);
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

test("sends the cookies of a cookie header with the page", async () => {
  await renderServer({ url: "/notes", headers: { cookie: "last-created=7" } });

  await expect.element(page.getByText("Last created: 7")).toBeVisible();
});

test("keeps the CSS of a page whose module loaded while another page was there", async () => {
  await renderServer({ url: "/" });

  // Next's router links the CSS of the page it navigates to. A page load
  // after it links it again, though the module of the page does not load
  // again.
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

test("adds an entry to the history for a page that the app loads, which back() returns from", async () => {
  await renderServer({ url: "/" });
  await page.getByRole("link", { name: "All notes, the long way" }).click();
  await expect.element(page.getByRole("heading", { name: "Notes" })).toBeVisible();

  window.history.back();

  await expect.element(page.getByRole("heading", { name: "Home" })).toBeVisible();
  expect(window.location.pathname).toBe("/");
});

test("posts a form without a Server Action in the encoding of the form, which Next renders the page for", async () => {
  await renderServer({ url: "/feedback" });

  await page.getByRole("button", { name: "Send" }).click();

  // As `multipart/form-data` Next would take it for a Server Action that is
  // not there, and answer 400.
  await expect.element(page.getByRole("heading", { name: "Home" })).toBeVisible();
  expect(window.location.pathname + window.location.search).toBe("/");
});

test("runs the Server Action of a form that the browser posts itself, which names it in its fields", async () => {
  await renderServer({ url: "/upload" });
  const files = new DataTransfer();
  files.items.add(new File(["posted"], "posted.txt", { type: "text/plain" }));
  (page.getByLabelText("File").element() as HTMLInputElement).files = files.files;

  // Not through React, as before the app has hydrated.
  document.querySelector("form")!.submit();

  await expect.poll(() => db.notes.get("posted.txt")?.body).toBe("posted");
});

test("answers a form that names a Server Action by an id that cannot be one with 400, as Next does", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const body = new FormData();
  body.append("$ACTION_ID_123", "");

  const response = await handleRequest("/upload", { method: "POST", body });

  expect(response.status).toBe(400);
  expect(await response.text()).toBe("Invalid Server Action request.");
  expect(String(warn.mock.calls[0]?.[0])).toContain("Invalid Server Actions request.");
});

test("answers a form that names a Server Action the app does not have with 409, and logs its id", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const id = "0".repeat(42);
  const body = new FormData();
  body.append(`$ACTION_ID_${id}`, "");

  const response = await handleRequest("/upload", { method: "POST", body });

  expect(response.status).toBe(409);
  expect(await response.text()).toBe("Server Action unavailable.");
  expect(String(warn.mock.calls[0]?.[0])).toContain(`Failed to find Server Action "${id}"`);
});

test("loads the page again at a reload, which owns the document and its URL", async () => {
  await renderServer({ url: "/notes" });
  db.notes.set("7", { id: "7", title: "After the reload", body: "" });

  window.location.reload();

  await expect.element(page.getByText("After the reload")).toBeVisible();
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
  // A document's render that outlives its request: a page with HTML is not of
  // the kept app, so it loads the next page as a document in either mode.
  await renderServer({ url: "/", ssr: true });
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

test("starts every test without what the app stored in the browser", async () => {
  // The theme test above stored its theme.
  expect(localStorage.getItem("theme")).toBeNull();

  await renderServer({ url: "/settings" });
  await expect.element(page.getByRole("button", { name: "Theme: light" })).toBeVisible();
});

test("forgets what the app stored in the browser after cleanup()", async () => {
  await renderServer({ url: "/settings" });
  await page.getByRole("button", { name: "Theme: light" }).click();
  await expect.element(page.getByRole("button", { name: "Theme: dark" })).toBeVisible();
  sessionStorage.setItem("draft", "Hello");
  expect(localStorage.getItem("theme")).toBe("dark");

  await cleanup();

  expect(localStorage.getItem("theme")).toBeNull();
  expect(sessionStorage.getItem("draft")).toBeNull();
  expect([localStorage.length, sessionStorage.length]).toEqual([0, 0]);
});

test("keeps the app and the browser's own storage of the origin apart", async () => {
  // A document of the origin without the plugin, like the UI of a host, has
  // the browser's storage. The page goes with the documents of the host, so
  // the test makes one each time it looks.
  const browserDocument = () => {
    const frame = document.body.appendChild(document.createElement("iframe"));
    onTestFinished(() => frame.remove());
    return frame.contentWindow!;
  };
  const host = browserDocument();
  onTestFinished(() => {
    const { localStorage, sessionStorage } = browserDocument();
    localStorage.removeItem("host-panel");
    sessionStorage.removeItem("host-tab");
  });
  // It stores in it, and this document hears of that: about the browser's
  // storage, not the page's.
  const heard: Array<{ key: string | null; area: Storage | null }> = [];
  const hear = ({ key, storageArea }: StorageEvent) => heard.push({ key, area: storageArea });
  window.addEventListener("storage", hear);
  onTestFinished(() => window.removeEventListener("storage", hear));
  host.localStorage.setItem("host-panel", "wide");
  host.sessionStorage.setItem("host-tab", "notes");
  await expect
    .poll(() => heard.map(({ key }) => key))
    .toEqual(expect.arrayContaining(["host-panel", "host-tab"]));
  for (const { area } of heard) {
    expect(area).not.toBe(localStorage);
    expect(area).not.toBe(sessionStorage);
  }

  await renderServer({ url: "/settings" });
  await page.getByRole("button", { name: "Theme: light" }).click();
  await expect.element(page.getByRole("button", { name: "Theme: dark" })).toBeVisible();

  // The page has none of the host's items.
  expect(localStorage.getItem("host-panel")).toBeNull();
  expect(sessionStorage.getItem("host-tab")).toBeNull();
  expect(Object.keys(localStorage)).toEqual(["theme"]);

  await cleanup();

  // The browser's storage has the host's items still, and none of the app's.
  const after = browserDocument();
  expect(after.localStorage.getItem("host-panel")).toBe("wide");
  expect(after.sessionStorage.getItem("host-tab")).toBe("notes");
  expect(after.localStorage.getItem("theme")).toBeNull();
});

test("has one storage of the page, which a library may take as it loads", async () => {
  // Every test is in a browser context of the app. A module that took the
  // storage as the file loaded, outside one, has the browser's.
  expect(storageAtImport).not.toBe(localStorage);
  const taken = localStorage;
  await renderServer({ url: "/" });
  taken.setItem("draft", "Hello");
  expect(localStorage.getItem("draft")).toBe("Hello");
  expect(storageAtImport.getItem("draft")).toBeNull();

  await cleanup();

  // The browser's own storage, which the one taken passes on to.
  expect(window.localStorage).toBe(storageAtImport);
  expect(taken.getItem("draft")).toBeNull();
  await newBrowserContext();
  expect(window.localStorage).toBe(taken);
  await renderServer({ url: "/" });
  localStorage.setItem("draft", "Again");
  expect(taken.getItem("draft")).toBe("Again");
});

describe("a test's beforeEach", () => {
  beforeEach(() => localStorage.setItem("theme", "dark"));

  test("seeds the storage of the page it opens", async () => {
    await renderServer({ url: "/settings" });

    await expect.element(page.getByRole("button", { name: "Theme: dark" })).toBeVisible();
  });
});

test("has the browser's own APIs once cleanup() closed the browser context", async () => {
  await renderServer({ url: "/settings" });
  expect(Object.hasOwn(document, "cookie")).toBe(true);
  expect("cookieStore" in window).toBe(false);

  await cleanup();

  expect(Object.getPrototypeOf(localStorage)).toBe(Storage.prototype);
  expect(Object.hasOwn(document, "cookie")).toBe(false);
  expect("cookieStore" in window).toBe(true);
  expect(Function.prototype.toString.call(fetch)).toContain("[native code]");
  // The next request to the app opens one again.
  expect((await handleRequest("/settings")).status).toBe(200);
  expect(Object.hasOwn(document, "cookie")).toBe(true);
});

test("keeps a spy on fetch that the test set in a browser context", async () => {
  const spy = vi.spyOn(globalThis, "fetch");

  await cleanup();
  expect(globalThis.fetch).toBe(spy);
  await newBrowserContext();

  expect(globalThis.fetch).toBe(spy);
  expect(await (await fetch("/settings")).text()).toContain("<h1>Settings</h1>");
  expect(spy).toHaveBeenCalledOnce();
});

// On Node.js Next renders the page after a Server Action outside the
// action's store, with `exit()`, so a redirect() in a component is one of the
// render, which replaces the page, not one of the action. Here too: Next's
// handler awaits the render inside the `exit()`, and the render starts there,
// outside the store. The handler is compiled, and has the store back after
// that `await`. See app/action-stores.test.tsx for what the action has after
// it.
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

test("loads a page with the one Vite client that the browser has", async () => {
  await renderServer({ url: "/settings" });
  // Vite's client opens a websocket when it is evaluated. The browser has one.
  const WebSocket = vi.spyOn(globalThis, "WebSocket");

  await renderServer({ url: "/settings" });

  await expect.element(page.getByRole("button", { name: "Theme: light" })).toBeVisible();
  expect(WebSocket).not.toHaveBeenCalled();
  // And the browser has loaded it from one URL: another URL is another
  // instance.
  const clients = performance
    .getEntriesByType("resource")
    .map((entry) => new URL(entry.name))
    .filter((url) => url.pathname.endsWith("/@vite/client"));
  expect(clients.map((url) => url.pathname + url.search)).toEqual(["/@vite/client"]);
});
