// What client.tsx, the app's client entry in the browser layer, runs of
// Next's own client entry.

export { appBootstrap } from "next/dist/client/app-bootstrap";
export { callServer } from "next/dist/client/app-call-server";

// What client.tsx renders a page of a kept app with: `renderAgain()`.
export { default as AppRouter } from "next/dist/client/components/app-router";
export { createMutableActionQueue } from "next/dist/client/components/app-router-instance";
export { createInitialRouterState } from "next/dist/client/components/router-reducer/create-initial-router-state";
export { invalidateBfCache } from "next/dist/client/components/segment-cache/bfcache";
export { invalidateEntirePrefetchCache } from "next/dist/client/components/segment-cache/cache";
export { HeadManagerContext } from "next/dist/shared/lib/head-manager-context.shared-runtime";

/** Next's client entry, which reads the Flight payload in the document as it loads. */
export const loadAppIndex = () => import("next/dist/client/app-index");

// What client.tsx reads a `redirect()` in the Flight payload of a page with,
// for a page of a kept app that loads by its payload alone: `redirectURL()`.
export { getURLFromRedirectError } from "next/dist/client/components/redirect";
export { isRedirectError } from "next/dist/client/components/redirect-error";
