import { handleRequest } from "vitest-plugin-rsc/nextjs/testing-library";
import { expect, inject, onTestFinished, test, vi } from "vitest";
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

test("keeps the not-found page of a path that is no route out of a search index", async () => {
  const response = await handleRequest("/nope");

  expect(response.status).toBe(404);
  // Next renders the tag for a response that is a 404 when the render starts.
  expect(await response.text()).toContain('<meta name="robots" content="noindex"/>');
  expect(await (await handleRequest("/notes")).text()).not.toContain("noindex");
});

test("answers a Server Action for a path that is no route as Next does", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  onTestFinished(() => warn.mockRestore());
  const call = (id: string) =>
    handleRequest("/nope", { method: "POST", headers: { "next-action": id }, body: "[]" });

  // Not with the not-found page. An id that cannot be one is a bad request.
  const invalid = await call("123");

  expect(invalid.status).toBe(400);
  expect(invalid.headers.get("x-nextjs-action-not-found")).toBe("1");
  expect(await invalid.text()).toBe("Invalid Server Action request.");

  // An id that could be one, of Next's build or of Vite RSC, is an action
  // that another deployment may have.
  const unknown = await call("00".repeat(21));

  expect(unknown.status).toBe(409);
  expect(await unknown.text()).toBe("Server Action unavailable.");
  expect((await call("/app/lib/actions.ts#gone")).status).toBe(409);
  expect(warn).toHaveBeenCalledTimes(3);
});

test("answers a Server Action with an id that cannot be one with a 400", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  onTestFinished(() => warn.mockRestore());

  // Not 42 characters, as an id of Next's build, and not `<module>#<export>`.
  const response = await handleRequest("/notes", {
    method: "POST",
    headers: { "next-action": "toString" },
    body: "[]",
  });

  expect(response.status).toBe(400);
  expect(await response.text()).toBe("Invalid Server Action request.");
  expect(String(warn.mock.calls[0]?.[0])).toContain(
    'The Server Reference ID did not match the expected format. Received "toString".',
  );
});

test("answers a Server Action that the app does not have the way Next does", async () => {
  // Next warns that it does not know the action.
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  onTestFinished(() => warn.mockRestore());

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
});

test("does not call an export of the app that is not a Server Action", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  onTestFinished(() => warn.mockRestore());

  // A function of the server, in a module without "use server".
  const response = await handleRequest("/notes", {
    method: "POST",
    headers: { "next-action": "/app/layout.tsx#default" },
    body: "[]",
  });

  expect(response.status).toBe(409);
  expect(response.headers.get("x-nextjs-action-not-found")).toBe("1");
  expect(warn).toHaveBeenCalledOnce();
});

test("reports the error of a Server Action whose module fails to load", async () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  onTestFinished(() => error.mockRestore());
  const call = () =>
    handleRequest("/notes", {
      method: "POST",
      headers: { "next-action": "/app/lib/broken-actions.ts#unreachable" },
      body: "[]",
    });

  const response = await call();

  expect(response.status).toBe(500);
  expect(response.headers.get("x-nextjs-action-not-found")).toBeNull();
  // React's production build sends an error by its digest only.
  const body = await response.text();
  if (inject("build") === "development") {
    expect(body).toContain("The actions of this module cannot load");
  } else {
    expect(body).toContain('"digest"');
    expect(body).not.toContain("The actions of this module cannot load");
  }
  expect(String(error.mock.calls[0]?.[0])).toContain("The actions of this module cannot load");

  // And again: the error is not replaced by "no such action" the second time.
  expect((await call()).status).toBe(500);
});

test("sends the cookie header of a request", async () => {
  const response = await handleRequest("/notes", { headers: { cookie: "last-created=3" } });

  expect(await response.text()).toContain("Last created: <!-- -->3");
});
