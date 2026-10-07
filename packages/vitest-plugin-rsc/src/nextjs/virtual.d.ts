declare module "virtual:vitest-plugin-rsc/next-manifest" {
  export const routes: {
    kind: "page" | "route";
    page: string;
    pathname: string;
    /** For a route of a node: what its modules are listed by, in place of `page`. */
    component?: string;
  }[];
  export const nextConfig: import("next/dist/server/config-shared").NextConfigComplete;
}

declare module "virtual:vitest-plugin-rsc/next-route-handlers" {
  const routeHandlers: Record<
    string,
    () => Promise<{ handler: import("./registry.ts").EdgeHandler }>
  >;
  export default routeHandlers;
}

declare module "virtual:vitest-plugin-rsc/next-app-pages" {
  const appPages: Record<string, () => Promise<unknown>>;
  export default appPages;
}

declare module "virtual:vitest-plugin-rsc/next-edge-entries" {
  const edgeEntries: Record<
    string,
    () => Promise<{ handler: import("./registry.ts").EdgeHandler }>
  >;
  export default edgeEntries;
}

declare module "@vitejs/plugin-rsc/vendor/react-server-dom/server.edge" {
  export function decodeReplyFromAsyncIterable(
    body: AsyncIterable<[string, string | File]>,
    serverManifest: unknown,
    options?: object,
  ): Promise<unknown[]>;
  export function createClientModuleProxy(moduleId: string): unknown;
}
