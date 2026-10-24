import { t as NodeOnPage } from "../node-on-page-DUz3A_G9.js";
import { callServer } from "next/dist/client/app-call-server.js";
//#region src/nextjs/client.d.ts
declare global {
  var __viteRscCallServer: typeof callServer;
  var __NEXT_HYDRATED_CB: (() => void) | undefined;
}
/**
 * Hydrates the document, or with a `container`, the node of a test in it.
 * Resolves once it has, with how to leave the page. Calls `loaded` once Next's
 * client has loaded, before a module of the app has. A page of a node tells
 * `nodeOnPage` what it does with the node: see node-rendered.tsx. The errors
 * that React reports on the root of the app go in `errors`, in order, but
 * for those of Next's control flow.
 *
 * Rejects once `signal` aborts, when the page is left before it has hydrated.
 * What it started is gone by then: the root, and the listeners React added.
 * A root that Next would create after that renders nothing.
 */
declare function start(loaded: () => void, container: Element | undefined, signal: AbortSignal, nodeOnPage: NodeOnPage | undefined, errors: unknown[], keep?: boolean): Promise<StartedApp>;
/** How to leave the page that `start()` or `renderAgain()` opened, and its app. */
type StartedApp = {
  /** Leaves the page. For a kept app, its root stays, with nothing in it. */unmount(): void; /** Leaves the app: its root goes, and the listeners React added for it. */
  leaveApp(): void;
};
/**
 * Renders the page in the document into the root of the app that `start()`
 * kept, in place of the page before it: what Next's entry does as the page
 * loads, without the entry, from the Flight payload in the document. The
 * modules of the app stay, and so does its root, so this is no page load:
 * its Flight payload is decoded, the router gets a state of its own from it,
 * and a tree with a key of its own mounts.
 * Resolves as `start()` does, once it has rendered.
 *
 * What the modules of the app keep stays from the page before: Next's caches
 * of its router are emptied, but the state of a module of the app, or of a
 * package, is still there.
 */
declare function renderAgain(signal: AbortSignal, errors: unknown[]): Promise<StartedApp>;
//#endregion
export { StartedApp, renderAgain, start };