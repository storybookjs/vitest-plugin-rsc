// What `vitestPluginNext()` provides to a worker of Vitest, with
// `TestProject.provide()`, for its `inject()`.

export {};

declare module "vitest" {
  interface ProvidedContext {
    /** The setup files of the run, for a worker of Node.js: see setup-node.ts. */
    "vitest-plugin-rsc:setup-files": string[];
  }
}
