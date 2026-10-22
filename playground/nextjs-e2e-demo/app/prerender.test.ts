import { cleanup, handleRequest } from "vitest-plugin-rsc/nextjs/testing-library";
import { afterEach, beforeEach, expect, inject, test, vi, type MockInstance } from "vitest";

// What `next build` prerenders, and `next start` keeps between requests: in
// production, as the build would. In development every request renders,
// as `next dev` renders it. CI runs this file with each `build`: see
// vitest.config.ts.
const build = inject("build");
const production = build === "production";

let consoleError: MockInstance<typeof console.error>;

beforeEach(() => {
  vi.restoreAllMocks();
  consoleError = vi.spyOn(console, "error");
});

afterEach(() => {
  // Next logs a page that changed from static to dynamic, and a failed render.
  expect(consoleError.mock.calls).toEqual([]);
  vi.restoreAllMocks();
});

// A request, and what it rendered: its number from `Math.random()`.
async function request(url: string, init?: RequestInit) {
  const response = await handleRequest(url, init);
  const json = response.headers.get("content-type")?.includes("json");
  // Without the comments where React has a text of the page meet a value.
  const text = (await response.text()).replaceAll("<!-- -->", "");
  const rendered = json
    ? (JSON.parse(text) as { random: number }).random
    : /rendered as ([\d.e-]+)/i.exec(text)?.[1];
  return { status: response.status, cache: response.headers.get("x-nextjs-cache"), rendered, text };
}

test("keeps a page that the build prerenders, and serves it to the next request", async () => {
  const first = await request("/prerendered");
  const second = await request("/prerendered");

  expect(first.status).toBe(200);
  if (production) {
    expect([first.cache, second.cache]).toEqual(["MISS", "HIT"]);
    expect(second.rendered).toBe(first.rendered);
  } else {
    expect([first.cache, second.cache]).toEqual([null, null]);
    expect(second.rendered).not.toBe(first.rendered);
  }
});

test("forgets the kept pages and route handlers with cleanup()", async () => {
  const page = await request("/prerendered");
  const route = await request("/prerendered/random");
  await cleanup();

  const pageAgain = await request("/prerendered");
  const routeAgain = await request("/prerendered/random");

  expect(pageAgain.rendered).not.toBe(page.rendered);
  expect(routeAgain.rendered).not.toBe(route.rendered);
  if (production) expect([pageAgain.cache, routeAgain.cache]).toEqual(["MISS", "MISS"]);
});

test("keeps a route handler that the build prerenders", async () => {
  const first = await request("/prerendered/random");
  const second = await request("/prerendered/random");

  if (production) {
    expect([first.cache, second.cache]).toEqual(["MISS", "HIT"]);
    expect(second.rendered).toBe(first.rendered);
  } else {
    expect(second.rendered).not.toBe(first.rendered);
  }
});

test("renders a page that reads the request at every request, as the build finds it dynamic", async () => {
  const first = await request("/prerendered/cookies", { headers: { cookie: "theme=dark" } });
  const second = await request("/prerendered/cookies", { headers: { cookie: "theme=light" } });

  expect([first.status, second.status]).toEqual([200, 200]);
  expect(first.text).toContain("Theme dark");
  expect(second.text).toContain("Theme light");
  expect(second.rendered).not.toBe(first.rendered);
  expect([first.cache, second.cache]).toEqual([null, null]);
});

test("renders a `force-dynamic` page at every request, as the build finds it dynamic", async () => {
  const first = await request("/prerendered/dynamic");
  const second = await request("/prerendered/dynamic");

  expect([first.status, second.status]).toEqual([200, 200]);
  expect(second.rendered).not.toBe(first.rendered);
  expect([first.cache, second.cache]).toEqual([null, null]);
});

test("renders a page with `revalidate = 0`, and one that reads the request in a `<Suspense>` boundary, at every request", async () => {
  const zero = [
    await request("/prerendered/revalidate-zero"),
    await request("/prerendered/revalidate-zero"),
  ];
  const first = await request("/prerendered/suspense", { headers: { cookie: "theme=dark" } });
  const second = await request("/prerendered/suspense", { headers: { cookie: "theme=light" } });

  expect(zero.map((r) => r.status)).toEqual([200, 200]);
  expect(zero[1]!.rendered).not.toBe(zero[0]!.rendered);
  expect(zero.map((r) => r.cache)).toEqual([null, null]);
  expect(first.text).toContain("Theme dark");
  expect(second.text).toContain("Theme light");
  expect([first.cache, second.cache]).toEqual([null, null]);
});

test("answers another method than GET with 405 for a kept route handler, as next start does", async () => {
  const before = await request("/prerendered/random", { method: "POST" });
  await request("/prerendered/random");
  const after = await request("/prerendered/random", { method: "POST" });

  // Next's route module answers for a method the handler does not export.
  expect([before.status, after.status]).toEqual([405, 405]);
  expect(after.cache).toBe(null);
  if (production) {
    const page = await request("/prerendered", { method: "PUT" });
    expect(page.status).toBe(405);
  }
});

test("renders a route handler that reads the request at every request", async () => {
  const first = await request("/prerendered/time", { headers: { cookie: "theme=dark" } });
  const second = await request("/prerendered/time", { headers: { cookie: "theme=light" } });

  expect([first.status, second.status]).toEqual([200, 200]);
  expect(first.text).toContain('"theme":"dark"');
  expect(second.text).toContain('"theme":"light"');
  expect([first.cache, second.cache]).toEqual([null, null]);
});

test("prerenders a path at its first request with a `generateStaticParams` that lists none, and with `force-static`", async () => {
  const every = [await request("/prerendered/every/x"), await request("/prerendered/every/x")];
  const forced = [await request("/prerendered/static/y"), await request("/prerendered/static/y")];

  expect(every[0]!.text).toContain("x, rendered as");
  expect(forced[0]!.text).toContain("y, rendered as");
  if (production) {
    expect(every.map((r) => r.cache)).toEqual(["MISS", "HIT"]);
    expect(forced.map((r) => r.cache)).toEqual(["MISS", "HIT"]);
    expect(every[1]!.rendered).toBe(every[0]!.rendered);
  } else {
    expect(every[1]!.rendered).not.toBe(every[0]!.rendered);
  }
});

test("forgets a kept page with cleanup() under fake timers too", async () => {
  vi.useFakeTimers();
  try {
    const first = await request("/prerendered");
    const again = await request("/prerendered");
    await cleanup();
    const afterCleanup = await request("/prerendered");

    if (production) expect(again.rendered).toBe(first.rendered);
    expect(afterCleanup.rendered).not.toBe(first.rendered);
  } finally {
    vi.useRealTimers();
  }
});

test("answers a path that `generateStaticParams` does not list with the not-found page, with `dynamicParams = false`", async () => {
  const listed = await request("/prerendered/listed/listed");
  const unlisted = await request("/prerendered/listed/other");

  expect(listed.status).toBe(200);
  expect(listed.text).toContain("listed, rendered as");
  // In development the plugin does not run `generateStaticParams`, where
  // `next dev` does for each request: see docs/internals/next-routes.md.
  if (production) {
    expect(unlisted.status).toBe(404);
    expect(unlisted.text).toContain("Nothing here");
  }
});

test("renders a kept page again after revalidatePath() of a route handler", async () => {
  const first = await request("/prerendered");
  await handleRequest("/api/revalidate?path=/prerendered", { method: "POST" });

  const second = await request("/prerendered");
  const third = await request("/prerendered");

  expect(second.rendered).not.toBe(first.rendered);
  if (production) {
    expect(third.rendered).toBe(second.rendered);
    expect([first.cache, third.cache]).toEqual(["MISS", "HIT"]);
  }
});
