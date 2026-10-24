import { r as ServerRequest, t as Opened } from "../registry-DSqmGFo0.js";
import { IncrementalCache } from "next/dist/server/lib/incremental-cache/index.js";
//#region src/nextjs/cache.d.ts
declare global {
  var __incrementalCache: IncrementalCache | undefined;
}
/** The directory of the build on the server's disk, `/.next/<generation>`. */
/**
 * Makes the server forget which tags were revalidated, and what it has
 * cached: the entries are on the server's disk, which `cleanup()` empties
 * after this. The generation keeps a cached function that was still running
 * when its test ended from being found under its key. An app's own
 * `cacheHandler` keeps the prerendered pages and route handlers where it
 * does, under their pathnames: those are expired as `revalidatePath("/",
 * "layout")` expires them, by the tag each of them has for the root layout.
 * What the build prerenders stays: that is the app's code (build-output.ts).
 */
declare function resetCaches(): Promise<void>;
//#endregion
//#region src/nextjs/ssr.d.ts
type HandleOptions = {
  /**
   * For a request the server makes to itself while it handles one, which
   * cannot wait for that one to finish.
   */
  nested?: boolean;
  /**
   * What a request gets that the server has nothing for: no route, and no
   * redirect or rewrite, after the middleware has let it through. The
   * not-found page of the app, or with `"pass"` no response: a deployment
   * looks for a file then, which here is the network's to answer.
   */
  unrouted?: "not-found" | "pass";
  /**
   * What the request opens, in place of what `renderServer()` opened: the
   * route of a node of its own, for this request only, or with `null`
   * nothing.
   */
  opened?: Opened | null;
  /**
   * Whether the request loads a page into the document, which starts the
   * files of its route as the server renders it: see `preloadRoute()` of the
   * registry.
   */
  pageLoad?: boolean;
};
/** The Next.js server of this app. Without a response only with `unrouted: "pass"`. */
declare function handleRequest(request: ServerRequest, options?: HandleOptions & {
  unrouted?: "not-found";
}): Promise<Response>;
declare function handleRequest(request: ServerRequest, options: HandleOptions): Promise<Response | undefined>;
/**
 * Ends the requests the server is still handling, when a page is left.
 *
 * A request that has its answer is writing the body: a short wait, then a
 * stop. A test can end while a page streams, on data that will never come.
 *
 * A request that has no answer yet runs code of the app, like a Server Action
 * or a route handler, and nothing can stop that. So it is waited for, and
 * then for the body it writes. So is what requests do after their response,
 * like `after()`. What comes next is not to run while any of that still reads
 * or sets the stores of a request, which would be the ones of the requests
 * that come next. A request that is sent in the meantime waits for all of
 * that, and is dropped: it is one of the page that was left.
 */
declare function settleRequests(): Promise<void>;
//#endregion
export { HandleOptions, handleRequest, resetCaches, settleRequests };