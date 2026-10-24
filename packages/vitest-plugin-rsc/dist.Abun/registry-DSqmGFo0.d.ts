//#region src/nextjs/registry.d.ts
type ServerRequest = {
  url: string;
  method: string;
  headers: Headers;
  body?: ReadableStream<Uint8Array> | Uint8Array | null;
  signal?: AbortSignal;
};
/**
 * Which pathnames of a route `next build` prerenders, from its
 * `generateStaticParams`, before it renders one: see prerender-verdict.ts.
 */
type PrerenderVerdict = {
  /** The pathnames the build prerenders. */pathnames: string[];
  /**
   * For a route with params: what Next does for a pathname not among them,
   * the `fallback` of its prerender manifest. `null` prerenders it at its
   * first request, `false` answers that it is not found.
   */
  fallback?: null | false;
};
/** See `NextRegistry.opened`. */
type Opened = {
  pathname: string; /** Whether the server in front of the app takes the request: proxy.ts and `next.config`. */
  proxy: boolean;
  /**
   * With `files`: the files of the host that render the node, `hostFiles` of
   * `renderServer()`. With `version`: which render of it the server sends,
   * which `rerender()` counts up, and the page says it has committed. The
   * server reads both as it renders, after `rerender()` has set them.
   */
  node?: {
    ui: unknown;
    layouts: boolean;
    files: string[];
    version?: number;
  };
  /**
   * Whether Next renders the page a Server Action redirects to, into the
   * response of the action, as Next's router shows that page next. Not for
   * `runInServerAction()`, which shows no page. Read from `openedByRequest`.
   */
  rendersRedirect?: boolean;
  /**
   * `false`: Next renders no HTML of the page, see `RenderServerOptions.ssr`.
   * Read from `openedByRequest`.
   */
  ssr?: boolean;
};
//#endregion
export { PrerenderVerdict as n, ServerRequest as r, Opened as t };