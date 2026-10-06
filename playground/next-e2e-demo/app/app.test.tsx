import { visit } from "vitest-plugin-rsc/next";
import { afterEach, beforeEach, expect, test, vi, type MockInstance } from "vitest";
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
  const response = await visit("/");

  expect(response.status).toBe(200);
  expect(document.documentElement.lang).toBe("en");
  await expect.element(page.getByRole("heading", { name: "Home" })).toBeVisible();

  await page.getByRole("button", { name: "Count: 0" }).click();
  await expect.element(page.getByRole("button", { name: "Count: 1" })).toBeVisible();
});

test("renders a dynamic route with its metadata", async () => {
  db.notes.set("1", { id: "1", title: "Inbox triage", body: "Sort the inbox" });

  await visit("/notes/1");

  await expect.element(page.getByRole("heading", { name: "Inbox triage" })).toBeVisible();
  expect(document.title).toBe("Inbox triage | Notes");
  expect(window.location.pathname).toBe("/notes/1");
});

test("navigates on the client with next/link", async () => {
  db.notes.set("1", { id: "1", title: "Inbox triage", body: "Sort the inbox" });
  await visit("/");

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
  await visit("/notes/1");
  await expect.element(page.getByText("Loading note…")).toBeVisible();

  resolveNote({ id: "1", title: "Inbox triage", body: "Sort the inbox" });
  await expect.element(page.getByRole("heading", { name: "Inbox triage" })).toBeVisible();
  await expect.element(page.getByText("Loading note…")).not.toBeInTheDocument();
});

test("follows a redirect() from a page", async () => {
  const response = await visit("/old");

  expect(response.redirected).toBe(true);
  expect(window.location.pathname).toBe("/notes");
  await expect.element(page.getByRole("heading", { name: "Notes" })).toBeVisible();
});

test("renders the not-found boundary when a page calls notFound()", async () => {
  const response = await visit("/notes/404");

  // The route has a loading.tsx, so the response had started when the page
  // called notFound(): the status is the 200 it started with.
  expect(response.status).toBe(200);
  await expect.element(page.getByRole("heading", { name: "Nothing here" })).toBeVisible();
});

test("serves a path that is not a route with the not-found page", async () => {
  const response = await visit("/nope");

  expect(response.status).toBe(404);
  await expect.element(page.getByRole("heading", { name: "Nothing here" })).toBeVisible();
});

test("runs a Server Action that sets a cookie, revalidates and redirects", async () => {
  await visit("/notes/new");

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
  await visit("/notes");

  await page.getByRole("button", { name: "Delete Inbox triage" }).click();

  await expect.element(page.getByRole("link", { name: "Inbox triage" })).not.toBeInTheDocument();
  await expect.element(page.getByRole("link", { name: "Plan the week" })).toBeVisible();
  expect([...db.notes.keys()]).toEqual(["2"]);
});

test("calls a Server Action from a Client Component and uses what it returns", async () => {
  db.notes.set("1", { id: "1", title: "Inbox triage", body: "" });
  await visit("/notes/1");

  await page.getByRole("button", { name: "Favorite" }).click();

  await expect.element(page.getByRole("button", { name: "Favorite", pressed: true })).toBeVisible();
  expect(db.notes.get("1")?.favorite).toBe(true);
});

test("renders parallel routes", async () => {
  db.notes.set("1", { id: "1", title: "Inbox triage", body: "" });

  await visit("/dashboard");

  await expect.element(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect
    .element(page.getByRole("complementary", { name: "Stats" }))
    .toHaveTextContent("1 notes");
});

test("shows the error boundary of a route, and recovers from it", async () => {
  // Next logs the error on the server and React logs it in the browser.
  consoleError.mockImplementation(() => {});

  const response = await visit("/broken");
  expect(response.status).toBe(500);
  await expect.element(page.getByRole("heading", { name: "Something went wrong" })).toBeVisible();

  db.notes.set("broken", { id: "broken", title: "Back up", body: "" });
  await page.getByRole("button", { name: "Try again" }).click();
  await expect.element(page.getByRole("heading", { name: "Back up" })).toBeVisible();
  expect(consoleError).toHaveBeenCalled();
  consoleError.mockClear();
});

test("starts every test without the cookies of the one before", async () => {
  // The Server Action test above left `last-created` behind.
  expect(document.cookie).toBe("");

  await visit("/notes");
  await expect.element(page.getByRole("heading", { name: "Notes" })).toBeVisible();
  await expect.element(page.getByText(/Last created/)).not.toBeInTheDocument();
});

test("sends the cookies the test sets before it visits", async () => {
  document.cookie = "last-created=7";

  await visit("/notes");

  await expect.element(page.getByText("Last created: 7")).toBeVisible();
});

test("loads the page when the app navigates without its router", async () => {
  await visit("/");

  await page.getByRole("link", { name: "All notes, the long way" }).click();

  await expect.element(page.getByRole("heading", { name: "Notes" })).toBeVisible();
  expect(window.location.pathname).toBe("/notes");
});
