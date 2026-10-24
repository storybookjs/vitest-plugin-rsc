// Scratch, for wip/flight-fallback: how Next answers a page load with
// `RSC: 1` and no router state tree, next to the document, for a page that
// redirects, calls notFound(), throws, or is redirected by the proxy. Logs
// only: read the lines RAW and RS of the CI log.
import { handleRequest, renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { expect, test, vi } from "vitest";
import { seenByProxy } from "./lib/proxy-log.ts";

const registry = (globalThis as any).__vitest_plugin_rsc_next__;
const routes = ["/old", "/moved", "/notes/404", "/broken", "/team"];
const pick = (r: Response) => ({
  status: r.status,
  redirected: r.redirected,
  path: new URL(r.url || "http://x/").pathname,
  ct: r.headers.get("content-type"),
  location: r.headers.get("location"),
  vary: r.headers.get("vary"),
  xHeaders: [...r.headers].filter(([k]) => k.startsWith("x-")).map(([k, v]) => `${k}=${v}`),
});

test("scratch: raw responses", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  for (const url of routes) {
    for (const rsc of [false, true]) {
      const r = await handleRequest(url, { redirect: "manual", headers: rsc ? { rsc: "1" } : {} });
      const body = await r.text();
      const errorRows = body
        .split("\n")
        .filter((l) => /^[0-9a-f]+:E\{/.test(l))
        .map((l) => l.slice(0, 200));
      console.log("RAW", JSON.stringify({ url, rsc, ...pick(r), len: body.length, errorRows }));
    }
  }
  expect(true).toBe(true);
});

test("scratch: renderServer", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  await renderServer({ url: "/" });
  for (const url of routes) {
    registry.requestTimings = [];
    seenByProxy.length = 0;
    let out: object;
    try {
      const { response, errors } = await renderServer({ url });
      out = {
        ...pick(response),
        at: location.pathname + location.search,
        errors: errors.map((e: any) => String(e?.message ?? e).slice(0, 80)),
      };
    } catch (e: any) {
      out = { threw: String(e?.message).slice(0, 160) };
    }
    const requests = (registry.requestTimings ?? []).map(
      (t: any) => `${t.kind}:${new URL(t.url).pathname}`,
    );
    console.log("RS", JSON.stringify({ url, ...out, requests, proxy: [...seenByProxy] }));
    registry.requestTimings = undefined;
  }
  expect(true).toBe(true);
});
