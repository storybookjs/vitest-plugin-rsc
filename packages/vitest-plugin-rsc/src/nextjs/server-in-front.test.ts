import { expect, test, vi } from "vitest";
import { incoming, middlewareResult } from "./server-in-front.ts";

// What the plugin gives the module in the app's server layers.
vi.mock("virtual:vitest-plugin-rsc/next-manifest", () => ({
  routing: { outputs: {}, routes: {}, appRoutes: {}, basePath: "", buildId: "test" },
}));

const url = new URL("http://localhost/located");
const elsewhere = "https://example.com/api/random";

test("takes a response with a Location header and a status that is no redirect for the answer of the middleware", () => {
  const response = Response.json({ foo: "bar" }, { headers: { location: elsewhere } });

  const result = middlewareResult(response, new Headers(), url);

  expect(result.bodySent).toBe(true);
  expect(result.redirect).toBeUndefined();
  expect(result.responseHeaders?.get("location")).toBe(elsewhere);
});

test("takes a Location header with the status of a redirect for a redirect", () => {
  const response = new Response(null, { status: 307, headers: { location: "/account" } });

  const result = middlewareResult(response, new Headers(), url);

  expect(result.bodySent).toBeUndefined();
  expect(result.redirect).toEqual({ url: new URL("/account", url), status: 307 });
});

test("lets a request through, and rewrites it, as `@next/routing` reads it", () => {
  const next = middlewareResult(
    new Response(null, { headers: { "x-middleware-next": "1", "x-proxy": "yes" } }),
    new Headers(),
    url,
  );
  expect(next.bodySent).toBeUndefined();
  expect(next.responseHeaders?.get("x-proxy")).toBe("yes");

  const rewritten = middlewareResult(
    new Response(null, { headers: { "x-middleware-rewrite": "http://localhost/docs" } }),
    new Headers(),
    url,
  );
  expect(rewritten.bodySent).toBeUndefined();
  expect(rewritten.rewrite?.href).toBe("http://localhost/docs");
});

test("takes a response without a header of the middleware for its answer", () => {
  const result = middlewareResult(Response.json({ pong: true }), new Headers(), url);

  expect(result.bodySent).toBe(true);
});

const headersOf = (url: string, init: Record<string, string> = {}) =>
  Object.fromEntries(incoming({ url, headers: new Headers(init) }).headers);

test("gives a request the x-forwarded-* headers of the URL it came in at, as next start does", () => {
  expect(headersOf("http://localhost:5173/notes", { host: "localhost:5173" })).toMatchObject({
    "x-forwarded-host": "localhost:5173",
    "x-forwarded-port": "5173",
    "x-forwarded-proto": "http",
  });
  expect(headersOf("https://notes.example.com/")).toMatchObject({
    "x-forwarded-host": "notes.example.com",
    "x-forwarded-port": "443",
    "x-forwarded-proto": "https",
  });
});

test("keeps the x-forwarded-* headers that a request comes with", () => {
  const headers = headersOf("http://localhost:5173/", {
    "x-forwarded-host": "notes.example.com",
    "x-forwarded-port": "8443",
    "x-forwarded-proto": "https",
  });

  expect(headers).toMatchObject({
    "x-forwarded-host": "notes.example.com",
    "x-forwarded-port": "8443",
    "x-forwarded-proto": "https",
  });
});

test("takes off the headers that only Next's own server sets", () => {
  const headers = headersOf("http://localhost/", { "x-middleware-set-cookie": "a=1" });

  expect(headers).not.toHaveProperty("x-middleware-set-cookie");
});
