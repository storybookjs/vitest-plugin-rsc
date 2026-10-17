"use client";

import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, type ReactNode } from "react";
import type { PageNode } from "./node-on-page.ts";

// The node of `renderServer()` that this page renders. Every page has a
// module graph of its own in the browser layer (see `renderServer()`), so a
// page that was left keeps telling its own node, which nobody waits on any
// more. The ssr layer has none.
let onPage: PageNode | undefined;

/** @internal For client.tsx, as it starts the page. */
export function setNodeOfPage(node: PageNode | undefined): void {
  onPage = node;
}

/**
 * @internal What the server renders around the node of `renderServer()`, from
 * its first render: it tells `rerender()` the page's router once the node is
 * mounted, which render of the node the page has committed, and when the node
 * has left the page. It renders the node and nothing else.
 */
export function NodeRendered({
  version,
  children,
}: {
  version: number;
  children?: ReactNode;
}): ReactNode {
  const { refresh } = useRouter();
  // In the commit, before React reports an error that takes the node's place.
  useLayoutEffect(() => onPage?.mounted(refresh), [refresh]);
  // Passive effects, after those of the node: Suspense takes down the layout
  // effects of what it hides behind a fallback, and not these.
  useEffect(() => onPage?.committed(version), [version]);
  useEffect(() => {
    onPage?.shown();
    return () => onPage?.hidden();
  }, []);
  return children;
}
