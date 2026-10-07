import { handleRequest, renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { afterEach, beforeEach, expect, test, vi, type MockInstance } from "vitest";
import { page } from "vitest/browser";
import { auditLog } from "../lib/audit.ts";
import { db } from "../lib/notes.ts";
import { getForecast } from "../lib/weather.ts";

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
    search: "",
    client: "test",
  });
});

test("gives each of two requests sent at once its own request stores", async () => {
  db.notes.set("1", { id: "1", title: "Inbox triage", body: "Sort the inbox" });
  db.notes.set("2", { id: "2", title: "Plan the week", body: "" });

  // The handler reads headers() after it has awaited: in a tab only one
  // request at a time can have its stores there.
  const [first, second] = await Promise.all([
    handleRequest("/api/notes/1", { headers: { "x-client": "first" } }),
    handleRequest("/api/notes/2", { headers: { "x-client": "second" } }),
  ]);

  expect(await first.json()).toMatchObject({ pathname: "/api/notes/1", client: "first" });
  expect(await second.json()).toMatchObject({ pathname: "/api/notes/2", client: "second" });
});

test("answers 500 when a route handler throws, and logs the error", async () => {
  consoleError.mockImplementation(() => {});

  const response = await handleRequest("/api/notes/broken");

  expect(response.status).toBe(500);
  // Next's request handler answers without a body.
  expect(await response.text()).toBe("");
  expect(consoleError.mock.calls).toEqual([[new Error("The database is down")]]);
  consoleError.mockClear();

  // The server goes on.
  expect((await handleRequest("/api/echo/a")).status).toBe(200);
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

test("does not open a page of another origin that a route handler redirects to", async () => {
  await expect(renderServer({ url: "/api/sign-in" })).rejects.toThrow(
    "the app navigated to another origin: https://example.com/sign-in?return_to=/notes",
  );
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

test("answers with a response that has no body", async () => {
  db.notes.set("1", { id: "1", title: "Inbox triage", body: "Sort the inbox" });

  const response = await handleRequest("/api/notes/1", { method: "DELETE" });

  expect(response.status).toBe(204);
  expect(response.body).toBeNull();
  expect(db.notes.has("1")).toBe(false);
});

test("runs after() of a route handler once the response is there", async () => {
  auditLog.length = 0;

  await handleRequest("/api/notes/1", { method: "DELETE" });

  expect(auditLog).toEqual([]);
  await expect.poll(() => auditLog).toEqual(["deleted note 1"]);
});

test("runs after() of a page, with the request it belongs to", async () => {
  auditLog.length = 0;
  document.cookie = "language=nl";

  const response = await handleRequest("/settings");
  await response.text();

  await expect.poll(() => auditLog).toEqual(["opened settings in nl"]);
});

test("does not let a request wait for an after() that does not end", async () => {
  // A response without a body ends on a timer, which the test has stopped.
  vi.useFakeTimers();
  try {
    await handleRequest("/api/notes/1", { method: "DELETE" });

    expect((await handleRequest("/api/echo/a")).status).toBe(200);
  } finally {
    vi.useRealTimers();
  }
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

test("serves an optional catch-all route handler with and without segments", async () => {
  expect(await (await handleRequest("/api/files")).json()).toEqual({ path: [] });
  expect(await (await handleRequest("/api/files/a/b")).json()).toEqual({ path: ["a", "b"] });
});

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

test("stops a route handler whose streamed response is no longer read", async () => {
  let resolveForecast!: (forecast: string) => void;
  vi.mocked(getForecast).mockReturnValue(new Promise((resolve) => (resolveForecast = resolve)));

  const response = await handleRequest("/api/forecast");
  const reader = response.body!.getReader();
  await reader.read();
  await reader.cancel();
  resolveForecast("sunny");
  // What the handler writes now goes nowhere, and Next reports no error.
  await new Promise((resolve) => setTimeout(resolve, 50));
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

test("serves a fetch() with a Request, its body and the cookies of the tab", async () => {
  document.cookie = "editor=kasper";
  const request = new Request("/api/notes/7", {
    method: "PUT",
    body: JSON.stringify({ title: "Plan the week" }),
  });

  const response = await fetch(request);

  expect(await response.json()).toEqual({
    note: { id: "7", title: "Plan the week", body: "" },
    editor: "kasper",
  });
});

test("reports a navigation to a route handler that does not answer with a document", async () => {
  await renderServer({ url: "/" });
  // An uncaught error, which would fail this test run too.
  const reportError = vi.spyOn(window, "reportError").mockImplementation(() => {});

  window.location.assign("/api/echo/a");

  await expect.poll(() => reportError.mock.calls).toHaveLength(1);
  expect(String(reportError.mock.calls[0]![0])).toMatch(
    /the app navigated to a URL that is not a page: .*\/api\/echo\/a responded with application\/json/,
  );
});

test("serves the fetch() of a Server Component with a route handler", async () => {
  await renderServer({ url: "/status" });

  await expect.element(page.getByRole("heading", { name: "Status of status" })).toBeVisible();
});

test("serves a route handler that asks for the edge runtime", async () => {
  // `export const runtime = "edge"`. It runs on Node.js like the others, and
  // the run warns about it when it starts.
  const response = await handleRequest("/api/runtime?x=1");

  expect(await response.json()).toEqual({
    asked: "edge",
    // The URL the tab asked for, with its origin.
    url: `${location.origin}/api/runtime?x=1`,
  });
});

test("keeps the Set-Cookie of a plain Response in a route handler", async () => {
  const response = await handleRequest("/api/plain");

  expect(response.headers.getSetCookie()).toEqual(["plain=1; Path=/"]);
  expect(document.cookie).toBe("plain=1");
});

test("keeps the Set-Cookie of Response.json() in a route handler", async () => {
  const response = await handleRequest("/api/plain/json");

  expect(response.headers.get("content-type")).toBe("application/json");
  expect(response.headers.getSetCookie()).toEqual(["plain=json; Path=/"]);
  expect(await response.json()).toEqual({ plain: true });
});

test("keeps a Set-Cookie header of NextResponse.json() in a route handler", async () => {
  const response = await handleRequest("/api/session", { method: "POST" });

  expect(response.headers.getSetCookie()).toEqual(["session=ada; Path=/"]);
  expect(await response.json()).toEqual({ user: "ada" });
});

test("leaves a same-origin fetch() that is not a route of the app to the dev server", async () => {
  // The source of this module's neighbour, which only the dev server has.
  const response = await fetch(new URL("../lib/weather.ts", import.meta.url));

  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toContain("javascript");
});
