import { expect, test, vi } from "vitest";
import { incoming } from "./server-in-front.ts";

// What the plugin gives the module in the app's server layers.
vi.mock("virtual:vitest-plugin-rsc/next-manifest", () => ({
  routing: { buildId: "test", outputs: {} },
}));

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
