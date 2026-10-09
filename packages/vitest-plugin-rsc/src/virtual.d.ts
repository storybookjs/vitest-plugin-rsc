declare module "virtual:vitest-plugin-rsc/vite-client" {
  export const createHotContext: unknown;
}

declare module "virtual:vitest-plugin-rsc/layers" {
  /** By the name of the environment. Nothing with a dev server. */
  const layers: Record<string, import("./built-layers.ts").BuiltLayer | undefined> | undefined;
  export default layers;
  /**
   * The modules of the page that the layers import, by the URL they have for
   * each, see host-module.ts. Nothing with a dev server, which serves them.
   */
  export const hostModules: Record<string, () => Promise<{ default: unknown }>> | undefined;
}
