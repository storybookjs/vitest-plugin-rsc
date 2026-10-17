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
