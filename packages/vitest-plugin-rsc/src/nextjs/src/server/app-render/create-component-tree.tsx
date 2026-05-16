import { isValidElement, type ReactNode } from "react";
import { isNextHttpAccessFallbackError } from "../../client/app-index.ts";

type NextCacheNodeSeedData = [
  node: ReactNode | null,
  parallelRoutes: Record<string, NextCacheNodeSeedData | null>,
  loading: null,
  isPartial: boolean,
  varyParams: unknown,
];

// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/server/app-render/create-component-tree.tsx#L600-L820
// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/client/components/layout-router.tsx#L607-L785
// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/client/components/http-access-fallback/http-access-fallback.ts#L1-L64
// Adaptation: Next create-component-tree stores segment boundary nodes in
// CacheNodeSeedData and LayoutRouter props. Browser-mode tests sometimes need
// to recover from a Flight payload that contains an HTTP access fallback
// rejection before the client LayoutRouter can select the nearest boundary.
// Begin adapted: Next.js CacheNodeSeedData access fallback boundary recovery
export function applyInitialAccessFallback(payload: { f: unknown[] }) {
  for (const flightDataPath of payload.f) {
    if (!Array.isArray(flightDataPath)) continue;
    const seedData = flightDataPath[flightDataPath.length - 3] as
      | NextCacheNodeSeedData
      | null
      | undefined;
    replaceAccessFallbackSeedData(seedData);
  }
}

export function findInitialAccessFallbackNode(payload: { f: unknown[] }) {
  for (const flightDataPath of payload.f) {
    if (!Array.isArray(flightDataPath)) continue;
    const seedData = flightDataPath[flightDataPath.length - 3] as
      | NextCacheNodeSeedData
      | null
      | undefined;
    const found = findNotFoundNode(seedData?.[0]);
    if (found) return found;
  }
}

function replaceAccessFallbackSeedData(
  seedData: NextCacheNodeSeedData | null | undefined,
  inheritedNotFound?: ReactNode,
) {
  if (!seedData) return;

  const node = seedData[0];
  const notFound = findNotFoundNode(node) ?? inheritedNotFound;
  if (notFound && isAccessFallbackSeedNode(seedData)) {
    seedData[0] = notFound;
  }

  for (const child of Object.values(seedData[1])) {
    replaceAccessFallbackSeedData(child, notFound);
  }
}

function isAccessFallbackSeedNode(seedData: NextCacheNodeSeedData) {
  return containsAccessFallback(seedData[0]) || isLeafLazySeedNode(seedData);
}

function isLeafLazySeedNode(seedData: NextCacheNodeSeedData) {
  return Object.keys(seedData[1]).length === 0 && containsThenable(seedData[0]);
}

function findNotFoundNode(value: unknown): ReactNode | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findNotFoundNode(item);
      if (found) return found;
    }
    return;
  }

  if (!isValidElement(value)) return;

  const props = value.props as { children?: unknown; notFound?: unknown };
  const child = findNotFoundNode(props.children);
  if (child) return child;

  if (Array.isArray(props.notFound) && props.notFound[0]) {
    return props.notFound[0] as ReactNode;
  }
}

function containsAccessFallback(value: unknown): boolean {
  if (isNextHttpAccessFallbackError(value)) return true;
  if (isRejectedAccessFallbackThenable(value)) return true;

  if (Array.isArray(value)) {
    return value.some((item) => containsAccessFallback(item));
  }

  if (isValidElement(value)) {
    return containsAccessFallback((value.props as { children?: unknown }).children);
  }

  return false;
}

function containsThenable(value: unknown): boolean {
  if (isThenable(value)) return true;

  if (Array.isArray(value)) {
    return value.some((item) => containsThenable(item));
  }

  if (isValidElement(value)) {
    return containsThenable((value.props as { children?: unknown }).children);
  }

  return false;
}

function isThenable(value: unknown): value is Promise<unknown> {
  return (
    (typeof value === "object" || typeof value === "function") &&
    value !== null &&
    "then" in value &&
    typeof (value as { then?: unknown }).then === "function"
  );
}

function isRejectedAccessFallbackThenable(value: unknown) {
  if (typeof value !== "object" || value === null) return false;

  const candidate = value as {
    status?: unknown;
    reason?: unknown;
    _reason?: unknown;
    value?: unknown;
    _value?: unknown;
  };
  if (candidate.status !== "rejected") return false;

  return (
    isNextHttpAccessFallbackError(candidate.reason) ||
    isNextHttpAccessFallbackError(candidate._reason) ||
    isNextHttpAccessFallbackError(candidate.value) ||
    isNextHttpAccessFallbackError(candidate._value)
  );
}
// End adapted
