import type { AppRouterActionQueue } from "next/dist/client/components/app-router-instance.js";
import { createMutableActionQueue as createNextMutableActionQueue } from "next/dist/client/components/app-router-instance.js";
import { reducer } from "next/dist/client/components/router-reducer/router-reducer.js";
import type { AppRouterState } from "next/dist/client/components/router-reducer/router-reducer-types.js";

let actionQueue: AppRouterActionQueue | null = null;

// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/client/components/app-router-instance.ts#L220-L256
// Adaptation: reuse Next's action queue implementation, but reset the private
// mutable queue fields before each component-test router mount.
// Begin adapted: Next.js mutable action queue state shape
export function createMutableActionQueue(initialState: AppRouterState): AppRouterActionQueue {
  actionQueue ??= createNextMutableActionQueue(initialState, null);
  actionQueue.state = initialState;
  actionQueue.action = reducer;
  actionQueue.pending = null;
  actionQueue.last = null;
  actionQueue.needsRefresh = false;
  return actionQueue;
}
// End adapted
