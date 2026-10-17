declare module "virtual:vitest-plugin-rsc/vite-client" {
  export const createHotContext: unknown;
}

declare module "virtual:vitest-plugin-rsc/layers" {
  /**
   * What a static build made of the environments that the page runs through
   * a module runner, by the name of each: see built-layers.ts. Nothing with a
   * dev server.
   */
  const layers: Record<string, import("./built-layers.ts").BuiltLayer | undefined> | undefined;
  export default layers;
}

declare module "virtual:vitest-plugin-rsc/client-references" {
  /**
   * In a static build: how to load each module a Flight payload can refer to,
   * by the id it has there. Nothing with a dev server: see static-build.ts.
   */
  const clientReferences: Record<string, () => Promise<unknown>> | undefined;
  export default clientReferences;
}

declare module "virtual:vitest-plugin-rsc/server-references" {
  /**
   * In a static build: how to load each module with Server Actions, by the id
   * Vite RSC gives it. Nothing with a dev server: see static-build.ts.
   */
  const serverReferences: Record<string, () => Promise<unknown>> | undefined;
  export default serverReferences;
}
