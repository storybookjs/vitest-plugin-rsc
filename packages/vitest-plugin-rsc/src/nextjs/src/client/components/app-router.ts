// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/client/components/app-router.tsx
// Adaptation: App render imports this client component while evaluated in the
// Vite RSC environment. This stub keeps the imported symbols app-render needs
// without bundling the visible browser App Router into the server graph.
// Begin adapted: Next.js app-router component compatibility source
export function createNextAppRouterComponentStubSource() {
  return `
import { createElement } from "react";

export function createEmptyCacheNode() {
  return {
    lazyData: null,
    rsc: null,
    prefetchRsc: null,
    head: null,
    prefetchHead: null,
    parallelRoutes: new Map(),
    loading: null,
    navigatedAt: -1,
  };
}

export default function AppRouter() {
  return createElement("vitest-next-app-router-stub");
}
`;
}
// End adapted
