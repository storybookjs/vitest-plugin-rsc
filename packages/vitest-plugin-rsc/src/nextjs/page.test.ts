import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { NodeOnPage } from "./node-on-page.ts";

// The modules that a page load uses, which need a browser as they evaluate.
// A `Page` is only the order of what its load made.
vi.mock("./app-requests.ts", () => ({}));
vi.mock("./client-graph.ts", () => ({}));
vi.mock("./document.ts", () => ({}));
vi.mock("./server-layers.ts", () => ({}));
vi.mock("../utils.ts", () => ({}));
// An app with a `basePath`.
vi.mock("virtual:vitest-plugin-rsc/next-manifest", () => ({ routing: { basePath: "/shop" } }));

beforeEach(() => {
  // Before `page.ts` evaluates: it keeps the timers it finds, as a test's
  // own may be fake.
  vi.useFakeTimers();
  vi.resetModules();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const pageOf = async (nodeOnPage?: NodeOnPage) => {
  const { Page } = await import("./page.ts");
  return new Page([], nodeOnPage);
};

test("releases what the page holds in reverse of how its load made it", async () => {
  const page = await pageOf();
  const released: string[] = [];
  page.defer(() => released.push("runner"));
  page.defer(() => released.push("leftovers"));
  page.defer(() => released.push("root"));

  await page.leave("cleanup()");

  expect(released).toEqual(["root", "leftovers", "runner"]);
});

test("runs every release when one throws, and rejects with the first error", async () => {
  const page = await pageOf();
  const released: string[] = [];
  const first = new Error("first");
  page.defer(() => released.push("runner"));
  page.defer(() => {
    released.push("leftovers");
    throw new Error("second");
  });
  page.defer(() => {
    released.push("root");
    throw first;
  });

  await expect(page.leave("cleanup()")).rejects.toBe(first);
  expect(released).toEqual(["root", "leftovers", "runner"]);
});

test("is left once: leaving again gets the same promise, and releases nothing again", async () => {
  const page = await pageOf();
  const release = vi.fn();
  page.defer(release);

  const left = page.leave("cleanup()");
  expect(page.leave("unmount()")).toBe(left);
  await left;
  await page.leave("unmount()");

  expect(release).toHaveBeenCalledTimes(1);
});

test("stops its load and tells its node at once, before it releases", async () => {
  const left = vi.fn();
  const page = await pageOf({ left } as unknown as NodeOnPage);
  const release = vi.fn();
  page.defer(release);
  let started!: () => void;
  page.starts(new Promise<void>((resolve) => (started = resolve)), () => {});
  expect(page.open).toBe(true);

  const leaving = page.leave("cleanup()");

  expect(page.signal.aborted).toBe(true);
  expect(page.signal.reason).toMatchObject({ name: "AbortError" });
  expect(page.open).toBe(false);
  expect(left).toHaveBeenCalledWith("cleanup()");
  // What the page holds waits for its client to stop starting.
  await vi.advanceTimersByTimeAsync(1000);
  expect(release).not.toHaveBeenCalled();
  started();
  await leaving;
  expect(release).toHaveBeenCalledOnce();
});

test("stops waiting for a page that does not stop starting, and releases it once it has", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  // What a release throws by then goes to the window, which Node has not.
  vi.stubGlobal("reportError", vi.fn());
  const page = await pageOf();
  const released: string[] = [];
  let started!: () => void;
  const stopped = vi.fn();
  page.starts(new Promise<void>((resolve) => (started = resolve)), stopped);
  page.defer(() => released.push("runner"));

  const leaving = page.leave("cleanup()");
  await vi.advanceTimersByTimeAsync(20_000);
  await leaving;

  expect(warn).toHaveBeenCalledOnce();
  // What records the start ends as leaving stops waiting, and what the page
  // holds stays until it has stopped starting.
  expect(stopped).toHaveBeenCalledOnce();
  expect(released).toEqual([]);
  // The client's unmount comes as the start settles: released with the rest.
  page.defer(() => released.push("root"));
  started();
  await vi.waitFor(() => expect(released).toEqual(["root", "runner"]));
});

test("has a redirect of a Flight payload go under the app's base path, as Next's 307 of a document does", async () => {
  const { redirectOf } = await import("./page.ts");
  // The URL of a `redirect()`, which its digest names: see `redirectURL()` of client.tsx.
  const client = { redirectURL: (digest: string) => digest.split(";")[2] };
  const payload = (...rows: string[]) => new TextEncoder().encode(rows.join("\n"));
  const redirect = (url: string) =>
    `1:E${JSON.stringify({ digest: `NEXT_REDIRECT;replace;${url};307;` })}`;

  expect(redirectOf(payload('0:"$L1"', redirect("/sign-in?next=%2Fnotes")), client)).toBe(
    "/shop/sign-in?next=%2Fnotes",
  );
  expect(redirectOf(payload(redirect("https://example.com/out")), client)).toBe(
    "https://example.com/out",
  );
  expect(redirectOf(payload('2:E{"digest":"1234"}'), client)).toBeUndefined();
});
