import { handleRequest, renderServer } from "vitest-plugin-rsc/next";
import { afterEach, beforeEach, expect, test, vi, type MockInstance } from "vitest";
import { page } from "vitest/browser";
import { auditLog } from "../lib/audit.ts";
import { db } from "../lib/notes.ts";
import { getForecast } from "../lib/weather.ts";

vi.mock("../lib/weather.ts");

let consoleError: MockInstance<typeof console.error>;

beforeEach(() => {
  vi.restoreAllMocks();
  db.notes.clear();
  consoleError = vi.spyOn(console, "error");
});

afterEach(() => {
  expect(consoleError.mock.calls).toEqual([]);
});

test("serves a route handler with a dynamic segment", async () => {
  db.notes.set("1", { id: "1", title: "Inbox triage", body: "Sort the inbox" });

  const response = await handleRequest("/api/notes/1", { headers: { "x-client": "test" } });

  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("application/json");
  expect(await response.json()).toEqual({
    note: { id: "1", title: "Inbox triage", body: "Sort the inbox" },
    // NextRequest and headers() are the request's.
    pathname: "/api/notes/1",
    client: "test",
  });
});

test("stores the cookies a route handler sets with NextResponse", async () => {
  db.notes.set("1", { id: "1", title: "Inbox triage", body: "Sort the inbox" });

  const response = await handleRequest("/api/notes/1");

  expect(response.headers.getSetCookie()).toEqual(["last-read=1; Path=/"]);
  expect(document.cookie).toBe("last-read=1");
});

test("answers 404 when a route handler calls notFound()", async () => {
  const response = await handleRequest("/api/notes/404");

  expect(response.status).toBe(404);
});

test("answers with the redirect() of a route handler", async () => {
  const response = await handleRequest("/api/notes/latest", {
    headers: { cookie: "last-created=3" },
    redirect: "manual",
  });

  expect(response.status).toBe(307);
  expect(response.headers.get("location")).toBe("/notes/3");
});

test("opens the page a route handler redirects to", async () => {
  db.notes.set("3", { id: "3", title: "Plan the week", body: "" });
  document.cookie = "last-created=3";

  const { response } = await renderServer({ url: "/api/notes/latest" });

  expect(response.redirected).toBe(true);
  expect(window.location.pathname).toBe("/notes/3");
  await expect.element(page.getByRole("heading", { name: "Plan the week" })).toBeVisible();
});

test("does not open the response of a route handler that is not a document", async () => {
  await expect(renderServer({ url: "/api/echo/a" })).rejects.toThrow(
    /\/api\/echo\/a responded with application\/json, which is not a page to open/,
  );
});

test("gives a route handler the body of a request and the cookies of the tab", async () => {
  db.notes.set("1", { id: "1", title: "Inbox triage", body: "Sort the inbox" });
  document.cookie = "editor=kasper";

  const response = await handleRequest("/api/notes/1", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "Inbox zero" }),
  });

  expect(await response.json()).toEqual({
    note: { id: "1", title: "Inbox zero", body: "Sort the inbox" },
    editor: "kasper",
  });
  expect(db.notes.get("1")?.title).toBe("Inbox zero");
  // Set with cookies() in the handler.
  expect(document.cookie).toContain("last-renamed=1");
});

test("answers with a response that has no body, and runs after() once it has", async () => {
  db.notes.set("1", { id: "1", title: "Inbox triage", body: "Sort the inbox" });
  auditLog.length = 0;

  const response = await handleRequest("/api/notes/1", { method: "DELETE" });

  expect(response.status).toBe(204);
  expect(response.body).toBeNull();
  expect(db.notes.has("1")).toBe(false);
  await expect.poll(() => auditLog).toEqual(["deleted note 1"]);
});

test.for(["GET", "POST", "PUT", "PATCH", "DELETE"])(
  "serves %s of a catch-all route handler",
  async (method) => {
    const body = method === "GET" ? undefined : `sent with ${method}`;

    const response = await handleRequest("/api/echo/a/b%20c?q=1", { method, body });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      method,
      path: ["a", "b c"],
      query: "1",
      body: body ?? "",
    });
  },
);

test("answers HEAD and OPTIONS the way Next implements them for a route handler", async () => {
  const head = await handleRequest("/api/echo/a", { method: "HEAD" });
  expect(head.status).toBe(200);
  expect(await head.text()).toBe("");

  const options = await handleRequest("/api/echo/a", { method: "OPTIONS" });
  expect(options.status).toBe(204);
  expect(options.headers.get("allow")).toBe("DELETE, GET, HEAD, OPTIONS, PATCH, POST, PUT");
});

test("answers 405 for a method a route handler does not export", async () => {
  const response = await handleRequest("/api/forecast", { method: "POST" });

  expect(response.status).toBe(405);
});

test("streams the response of a route handler, which reads a mocked module", async () => {
  let resolveForecast!: (forecast: string) => void;
  vi.mocked(getForecast).mockReturnValue(new Promise((resolve) => (resolveForecast = resolve)));

  const response = await handleRequest("/api/forecast");
  const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader();

  // The response is there before the service has answered.
  expect(await reader.read()).toEqual({ done: false, value: "Today: " });
  expect(getForecast).toHaveBeenCalledOnce();

  resolveForecast("sunny");
  expect(await reader.read()).toEqual({ done: false, value: "sunny" });
  expect(await reader.read()).toEqual({ done: true, value: undefined });
});

test("serves the fetch() of a Client Component with a route handler", async () => {
  db.notes.set("1", { id: "1", title: "Inbox triage", body: "Sort the inbox" });
  document.cookie = "editor=kasper";
  await renderServer({ url: "/notes/1" });

  await page.getByRole("textbox", { name: "New title" }).fill("Inbox zero");
  await page.getByRole("button", { name: "Rename" }).click();

  // The handler got the cookie of the tab, and the tab the cookie it set.
  await expect
    .element(page.getByRole("status"))
    .toHaveTextContent("Renamed to Inbox zero by kasper");
  expect(document.cookie).toContain("last-renamed=1");
  expect(db.notes.get("1")?.title).toBe("Inbox zero");
  // The component refreshes the router: the page is rendered again.
  await expect.element(page.getByRole("heading", { name: "Inbox zero" })).toBeVisible();
});

test("leaves a same-origin fetch() that is not a route of the app to the dev server", async () => {
  // The source of this module's neighbour, which only the dev server has.
  const response = await fetch(new URL("../lib/weather.ts", import.meta.url));

  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toContain("javascript");
});
