import * as React from "react";
import type { Thenable } from "./thenable.ts";

// React's internals that the renderer of client references reads, see
// render-client-reference.ts: here, and in no other module. Each is
// feature-detected. A React that lacks one, like any production build, which
// has no `act()` queue, gets nothing done here: `act()` then resolves as React
// itself has it resolve.
//
// `act()` resolves once the work that React queued in its scope is done. A
// root that suspends at its shell, outside any Suspense boundary, has nothing
// queued while it waits: React's own `use()` holds `act()` for one task only,
// for a render of the default lane. So `await act(() => root.render(tree))`
// would resolve while a client reference is still loading, before anything of
// the tree has committed. A hold is what React queues for a promise that a
// transition waits on: a continuation that says it used a promise, which
// `act()` runs again in its next task until the load has settled. Then React's
// retry commits the tree, inside `act()`.

type Internals = {
  /** The dispatcher of the render that is running, `null` outside one. */
  H?: unknown;
  /** The queue of the `act()` scope that is open, `null` outside one. */
  actQueue?: unknown;
  /** What a continuation sets to stay in that queue. */
  didUsePromise?: unknown;
};

const internals = Reflect.get(
  React,
  "__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE",
) as Internals | undefined;

/**
 * Whether this React is known not to be rendering a component now: the code
 * that runs is called by something else, like server code, or rendered by
 * another copy of React, like a page's.
 */
export function outsideRender(): boolean {
  return internals !== undefined && "H" in internals && internals.H === null;
}

type Hold = () => Hold | null;

// The act queue that each thenable holds, so that a thenable holds one queue
// once however often it renders.
const holding = new WeakMap<Thenable<unknown>, unknown[]>();

/**
 * Holds the `act()` scope that is open, if any, until `thenable` settles. One
 * hold for each thenable and scope, and none for a thenable that has settled.
 *
 * React flushes its queue in a loop that calls a continuation again at once
 * unless it says it used a promise. A React that queues the same way and
 * reads another flag would call the hold forever, in one task: so a hold that
 * is called twice before a microtask has passed lets go, and `act()` resolves
 * as it would without it.
 */
export function holdAct(thenable: Thenable<unknown>): void {
  if (!internals || thenable.status !== "pending") return;
  const queue = internals.actQueue;
  if (!Array.isArray(queue) || typeof internals.didUsePromise !== "boolean") return;
  if (holding.get(thenable) === queue) return;
  holding.set(thenable, queue);
  let calledInThisTask = false;
  const hold: Hold = () => {
    if (thenable.status !== "pending" || calledInThisTask) return null;
    calledInThisTask = true;
    queueMicrotask(() => (calledInThisTask = false));
    internals.didUsePromise = true;
    return hold;
  };
  queue.push(hold);
}
