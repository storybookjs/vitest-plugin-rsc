import { isValidElement, type ReactElement, type ReactNode } from "react";
import type { CacheNodeSeedData, FlightRouterState } from "next/dist/shared/lib/app-router-types";
import { NextRouter } from "vitest-plugin-rsc/nextjs/client";

export type NextRouterElementProps = {
  children: ReactNode;
  route?: string;
  url?: string;
  initialTree?: FlightRouterState;
  initialSeedData?: CacheNodeSeedData;
};

export function findNextRouterElement(node: ReactNode): ReactElement | undefined {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findNextRouterElement(child);
      if (found) return found;
    }
    return;
  }

  if (!isValidElement(node)) return;
  if (isNextRouterElement(node)) {
    return node;
  }

  return findNextRouterElement((node.props as { children?: ReactNode }).children);
}

export function isNextRouterElement(node: ReactElement) {
  return (
    node.type === NextRouter ||
    (node.type as { $$vitestPluginRscNextRouter?: true }).$$vitestPluginRscNextRouter ||
    (node.type as { $$id?: string }).$$id?.endsWith("#NextRouter")
  );
}
