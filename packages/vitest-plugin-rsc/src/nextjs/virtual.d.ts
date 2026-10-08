declare module "virtual:vitest-plugin-rsc/next-manifest" {
  export const routes: {
    kind: "page" | "route";
    page: string;
    pathname: string;
    /** For a route of a node: what its modules are listed by, in place of `page`. */
    component?: string;
  }[];
  export const nextConfig: import("next/dist/server/config-shared").NextConfigComplete;
  export const routing: import("./project.ts").NextRouting;
  export const routesManifest: import("next/dist/build").RoutesManifest;
  export const preview: import("./project.ts").NextProject["preview"];
}

declare module "virtual:vitest-plugin-rsc/next-middleware" {
  /** Nothing for an app without a `proxy.ts` or a `middleware.ts`. */
  const loadMiddleware:
    | (() => Promise<{ handler: import("./registry.ts").MiddlewareHandler }>)
    | undefined;
  export default loadMiddleware;
}

declare module "virtual:vitest-plugin-rsc/node-stream" {
  export { Readable } from "node:stream";
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
