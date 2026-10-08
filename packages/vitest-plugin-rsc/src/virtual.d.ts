declare module "virtual:vitest-plugin-rsc/vite-client" {
  export const createHotContext: unknown;
}

declare module "virtual:vitest-plugin-rsc/layers" {
  /** An environment that a static build made into files for the module runner. */
  export type BuiltLayer = {
    /** The URL of its directory, which ends in a slash. */
    base: string;
    /** The file of a module that the page imports by its id. */
    entries: Record<string, string>;
  };
  /** By the name of the environment. Nothing with a dev server. */
  const layers: Record<string, BuiltLayer | undefined> | undefined;
  export default layers;
}
