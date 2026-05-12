import type { CacheNodeSeedData, FlightRouterState } from "next/dist/shared/lib/app-router-types";
import type { ReactNode } from "react";

export function createSeedDataFromFlightRouterState(
  tree: FlightRouterState,
  children: ReactNode,
): CacheNodeSeedData {
  // Begin copy: Next.js CacheNodeSeedData recursive tuple shape
  // Source: https://github.com/vercel/next.js/blob/4588a7354283f97e2124e3d82f55733ca4eb9373/packages/next/src/server/app-render/create-component-tree.tsx#L58-L80
  // Source: https://github.com/vercel/next.js/blob/4588a7354283f97e2124e3d82f55733ca4eb9373/packages/next/src/shared/lib/app-router-types.ts#L261-L284
  // Adaptation: component tests already provide the rendered RSC node, so the
  // same node is used at each segment the App Router can request.
  const parallelRoutes: CacheNodeSeedData[1] = {};
  for (const [parallelRouteKey, childTree] of Object.entries(tree[1])) {
    parallelRoutes[parallelRouteKey] = createSeedDataFromFlightRouterState(childTree, children);
  }

  const seedData: CacheNodeSeedData = [children, parallelRoutes, null, false, null];
  // End copy
  return seedData;
}
