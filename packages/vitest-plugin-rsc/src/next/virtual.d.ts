declare module "virtual:vitest-plugin-rsc/next-manifest" {
  export const routes: { page: string; pathname: string }[];
  export const nextConfig: Record<string, unknown>;
}

declare module "virtual:vitest-plugin-rsc/next-vite-client" {
  export const createHotContext: unknown;
}

declare module "virtual:vitest-plugin-rsc/next-app-pages" {
  const appPages: Record<string, () => Promise<unknown>>;
  export default appPages;
}

declare module "virtual:vitest-plugin-rsc/next-edge-entries" {
  const edgeEntries: Record<
    string,
    () => Promise<{
      handler(
        request: { url: string; method: string; headers: Headers; body?: unknown },
        context: { waitUntil?: (promise: Promise<unknown>) => void; signal?: AbortSignal },
      ): Promise<Response>;
    }>
  >;
  export default edgeEntries;
}

declare module "@vitejs/plugin-rsc/vendor/react-server-dom/static.edge" {
  export function prerender(
    model: unknown,
    clientManifest: unknown,
    options?: object,
  ): Promise<{ prelude: ReadableStream<Uint8Array> }>;
}

declare module "@vitejs/plugin-rsc/vendor/react-server-dom/server.edge" {
  export function decodeReplyFromAsyncIterable(
    body: AsyncIterable<[string, string | File]>,
    serverManifest: unknown,
    options?: object,
  ): Promise<unknown[]>;
  export function createClientModuleProxy(moduleId: string): unknown;
}
