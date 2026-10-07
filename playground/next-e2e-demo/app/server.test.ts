import { handleRequest } from "vitest-plugin-rsc/next";
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

test("sends the cookie header of a request", async () => {
  const response = await handleRequest("/notes", { headers: { cookie: "last-created=3" } });

  expect(await response.text()).toContain("Last created: <!-- -->3");
});
