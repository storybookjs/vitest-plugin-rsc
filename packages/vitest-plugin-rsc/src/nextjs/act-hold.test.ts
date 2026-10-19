import * as React from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { holdAct } from "./act-hold.ts";
import { fulfilled, track, type Thenable } from "./thenable.ts";

// The hold of an `act()` scope, with React's development build, which has
// `act()`. And with a React of its own, whose internals the test sets, for
// what a version of React might change.

type Hold = () => Hold | null;
type Internals = { H?: unknown; actQueue?: Hold[] | null; didUsePromise?: boolean };
const internalsName = "__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE";
const internals = Reflect.get(React, internalsName) as Internals;
const scope = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeEach(() => {
  scope.IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  delete scope.IS_REACT_ACT_ENVIRONMENT;
  vi.doUnmock("react");
  vi.resetModules();
});

/** A load that settles after `ms`. */
function load(ms: number, outcome: "fulfilled" | "rejected" = "fulfilled"): Thenable<string> {
  return track(
    new Promise<string>((resolve, reject) =>
      setTimeout(
        () => (outcome === "fulfilled" ? resolve("loaded") : reject(new Error("failed"))),
        ms,
      ),
    ),
  );
}

test("act() resolves before a load settles, unless the load holds it", async () => {
  const unheld = load(30);
  await React.act(async () => {});
  expect(unheld.status).toBe("pending");

  const held = load(30);
  await React.act(async () => holdAct(held));
  expect(held.status).toBe("fulfilled");
});

test("lets act() go once the load fails", async () => {
  const failing = load(30, "rejected");

  await React.act(async () => holdAct(failing));

  expect(failing.status).toBe("rejected");
});

test("holds a scope once for a thenable, and not for one that has settled", async () => {
  const loading = load(10);
  let queued: number | undefined;

  await React.act(async () => {
    holdAct(loading);
    // As the proxies of a tree render, each with the tree's thenable.
    holdAct(loading);
    holdAct(fulfilled("loaded"));
    queued = internals.actQueue?.length;
  });

  expect(queued).toBe(1);
});

test("holds nothing outside an act() scope", () => {
  holdAct(load(10));

  expect(internals.actQueue).toBeNull();
});

// A React of its own, for what a change of React's internals does.
async function withInternals(own: Internals) {
  vi.resetModules();
  vi.doMock("react", () => ({ [internalsName]: own }));
  return import("./act-hold.ts");
}

test("lets go when React calls the hold again before a microtask has passed", async () => {
  const own: Internals = { H: null, actQueue: [], didUsePromise: false };
  const { holdAct } = await withInternals(own);
  holdAct(load(10));
  const hold = own.actQueue![0]!;

  // React's loop, as it would be in a version that reads another flag than
  // `didUsePromise`: it calls a continuation again until it returns null.
  let calls = 0;
  for (let next: Hold | null = hold; next && calls < 100; calls++) next = next();

  expect(calls).toBe(2);
  // React that reads the flag calls it again in a later task.
  own.didUsePromise = false;
  await Promise.resolve();
  expect(hold()).toBe(hold);
  expect(own.didUsePromise).toBe(true);
});

test("holds nothing with a React that has no act() queue or no flag for it", async () => {
  // A production build of React has no `act()`.
  for (const own of [{ H: null }, { H: null, actQueue: [] }] as Internals[]) {
    const { holdAct } = await withInternals(own);
    holdAct(load(10));
    expect(own.actQueue ?? []).toEqual([]);
  }
});

test("tells whether React is rendering, where it can", async () => {
  const own: Internals = { H: null };
  const { outsideRender } = await withInternals(own);

  expect(outsideRender()).toBe(true);
  own.H = {};
  expect(outsideRender()).toBe(false);
  // A React that does not say: the render goes on, and React's own errors speak.
  expect((await withInternals({})).outsideRender()).toBe(false);
});
