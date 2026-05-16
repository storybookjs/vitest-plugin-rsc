import { expect, test } from "vitest";
import { buildFlightRouterStateWithNext } from "./flight-router-state.ts";

test("builds route state through Next loader-tree machinery", async () => {
  const tree = await buildFlightRouterStateWithNext(
    "/note/[id]/[slug]",
    "/note/someid/someslug",
    "?a=1",
  );

  expect(segmentPath(tree)).toEqual([
    "",
    "note",
    ["id", "someid", "d"],
    ["slug", "someslug", "d"],
    '__PAGE__?{"a":"1"}',
  ]);
  expectRootLayout(tree);
});

test("builds catch-all route state through Next loader-tree machinery", async () => {
  const tree = await buildFlightRouterStateWithNext("/docs/[...slug]", "/docs/a/b", "");

  expect(segmentPath(tree)).toEqual(["", "docs", ["slug", "a/b", "c"], "__PAGE__"]);
  expectRootLayout(tree);
});

test("builds optional catch-all route state through Next loader-tree machinery", async () => {
  const tree = await buildFlightRouterStateWithNext("/docs/[[...slug]]", "/docs", "");

  expect(segmentPath(tree)).toEqual(["", "docs", ["slug", "", "oc"], "__PAGE__"]);
  expectRootLayout(tree);
});

test("keeps route groups in the router state without consuming pathname segments", async () => {
  const tree = await buildFlightRouterStateWithNext("/(auth)/sign-in", "/sign-in", "");

  expect(segmentPath(tree)).toEqual(["", "(auth)", "sign-in", "__PAGE__"]);
  expectRootLayout(tree);
});

test("resolves dynamic params after route groups using pathname depth", async () => {
  const tree = await buildFlightRouterStateWithNext("/(notes)/notes/[id]", "/notes/a%20b", "");

  expect(segmentPath(tree)).toEqual(["", "(notes)", "notes", ["id", "a%20b", "d"], "__PAGE__"]);
  expectRootLayout(tree);
});

test("rejects pathnames that do not match static route segments", async () => {
  await expect(buildFlightRouterStateWithNext("/notes/[id]", "/users/123", "")).rejects.toThrow(
    'Pattern "/notes/[id]" does not match pathname "/users/123".',
  );
});

function segmentPath(state: unknown): unknown[] {
  const segments: unknown[] = [];
  let current = state;

  while (Array.isArray(current)) {
    const [segment, parallelRoutes] = current as [
      segment: unknown,
      parallelRoutes?: Record<string, unknown>,
    ];
    segments.push(normalizeSegment(segment));
    current = parallelRoutes?.children;
  }

  return segments;
}

function normalizeSegment(segment: unknown): unknown {
  if (Array.isArray(segment) && segment.length === 4 && segment[3] === null) {
    return segment.slice(0, 3);
  }

  return segment;
}

function expectRootLayout(state: unknown) {
  if (!Array.isArray(state)) {
    throw new TypeError("Expected FlightRouterState array.");
  }

  expect(state[4]).toBeTruthy();
}
