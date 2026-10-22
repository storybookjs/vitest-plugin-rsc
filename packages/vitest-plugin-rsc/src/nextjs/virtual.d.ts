declare module "virtual:vitest-plugin-rsc/next-manifest" {
  export const routes: {
    kind: "page" | "route";
    page: string;
    pathname: string;
    /** For a route of a node: what its modules are listed by, in place of `page`. */
    component?: string;
    /** For a route of a node: with the layouts of the app's route `page`. */
    layouts?: true;
  }[];
  export const nextConfig: import("next/dist/server/config-shared").NextConfigComplete;
  export const routing: import("./project.ts").NextRouting;
  export const routesManifest: import("next/dist/build").RoutesManifest;
  export const preview: import("./project.ts").NextProject["preview"];
  /** The `build` option: which code of Next runs, and so whether it keeps what it prerenders. */
  export const build: import("./build.ts").NextBuild;
  /** The `fast` option: see fast-mode.ts. */
  export const fast: boolean;
}

declare module "virtual:vitest-plugin-rsc/next-cache-handlers" {
  /** The modules of the cache handlers that `next.config` names. */
  export const cacheHandler: (() => Promise<{ default?: unknown }>) | undefined;
  export const cacheHandlers: Record<string, () => Promise<{ default?: unknown }>>;
}

declare module "virtual:vitest-plugin-rsc/next-env" {
  /** What the page's `process.env` gets: see project/env.ts. */
  const env: Record<string, string>;
  export default env;
}

declare module "virtual:vitest-plugin-rsc/next-middleware" {
  /** Nothing for an app without a `proxy.ts` or a `middleware.ts`. */
  const loadMiddleware:
    | (() => Promise<{ handler: import("./registry.ts").MiddlewareHandler }>)
    | undefined;
  export default loadMiddleware;
}

declare module "virtual:vitest-plugin-rsc/next-route-handlers" {
  const routeHandlers: Record<
    string,
    () => Promise<{ handler: import("./registry.ts").RequestHandler }>
  >;
  export default routeHandlers;
}

declare module "virtual:vitest-plugin-rsc/next-app-pages" {
  const appPages: Record<string, () => Promise<unknown>>;
  export default appPages;
}

declare module "@vitejs/plugin-rsc/vendor/react-server-dom/server.edge" {
  export function decodeReplyFromAsyncIterable(
    body: AsyncIterable<[string, string | File]>,
    serverManifest: unknown,
    options?: object,
  ): Promise<unknown[]>;
  export function createClientModuleProxy(moduleId: string): unknown;
}

// In the browser layer, Next's own copy: see `vendoredFlight()` in plugin.ts.
declare module "@vitejs/plugin-rsc/vendor/react-server-dom/client.browser" {
  export function createFromReadableStream<T>(
    stream: ReadableStream<Uint8Array>,
    options?: { callServer?: unknown },
  ): Promise<T>;
}
