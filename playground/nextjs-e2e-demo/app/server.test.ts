import { handleRequest } from "vitest-plugin-rsc/nextjs";
import { expect, test, vi } from "vitest";
import { db } from "./lib/notes.ts";

test("responds to an RSC request with a Flight payload", async () => {
  db.notes.set("1", { id: "1", title: "Inbox triage", body: "Sort the inbox" });

  const response = await handleRequest("/notes/1", { headers: { rsc: "1" } });
  const body = await response.text();

  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("text/x-component");
  expect(body).toContain("Inbox triage");
});

test("responds to a document request with HTML", async () => {
  db.notes.set("1", { id: "1", title: "Inbox triage", body: "Sort the inbox" });

  const response = await handleRequest("/notes/1");
  const body = await response.text();

  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
  expect(body).toContain("<h1>Inbox triage</h1>");
});

test("answers a Server Action that the app does not have the way Next does", async () => {
  // Next warns that it does not know the action.
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

  // An id of Next's own build, as an older deployment of the app would send.
  const response = await handleRequest("/notes", {
    method: "POST",
    headers: { "next-action": "00".repeat(21) },
    body: "[]",
  });

  expect(response.status).toBe(409);
  expect(response.headers.get("x-nextjs-action-not-found")).toBe("1");
  expect(await response.text()).toBe("Server Action unavailable.");
  expect(warn).toHaveBeenCalledOnce();
  warn.mockRestore();
});

test("does not call an export of the app that is not a Server Action", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

  // A function of the server, in a module without "use server".
  const response = await handleRequest("/notes", {
    method: "POST",
    headers: { "next-action": "/app/layout.tsx#default" },
    body: "[]",
  });

  expect(response.status).toBe(409);
  expect(response.headers.get("x-nextjs-action-not-found")).toBe("1");
  expect(warn).toHaveBeenCalledOnce();
  warn.mockRestore();
});

test("reports the error of a Server Action whose module fails to load", async () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  const call = () =>
    handleRequest("/notes", {
      method: "POST",
      headers: { "next-action": "/app/lib/broken-actions.ts#unreachable" },
      body: "[]",
    });

  const response = await call();

  expect(response.status).toBe(500);
  expect(response.headers.get("x-nextjs-action-not-found")).toBeNull();
  expect(await response.text()).toContain("The actions of this module cannot load");
  expect(String(error.mock.calls[0]?.[0])).toContain("The actions of this module cannot load");

  // And again: the error is not replaced by "no such action" the second time.
  expect((await call()).status).toBe(500);
  error.mockRestore();
});

test("sends the cookie header of a request", async () => {
  const response = await handleRequest("/notes", { headers: { cookie: "last-created=3" } });

  expect(await response.text()).toContain("Last created: <!-- -->3");
});
