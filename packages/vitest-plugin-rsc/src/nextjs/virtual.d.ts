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

declare module "virtual:vitest-plugin-rsc/next-client-references" {
  /**
   * In a static build: how to load each module a Flight payload can refer to,
   * by the id it has there. Nothing with a dev server.
   */
  const clientReferences: Record<string, () => Promise<unknown>> | undefined;
  export default clientReferences;
}

declare module "virtual:vitest-plugin-rsc/next-server-references" {
  /**
   * In a static build: how to load each module with Server Actions, by the id
   * Vite RSC gives it. Nothing with a dev server.
   */
  const serverReferences: Record<string, () => Promise<unknown>> | undefined;
  export default serverReferences;
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
