import { expect, test, vi } from "vitest";
import { middlewareResult } from "./server-in-front.ts";

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
