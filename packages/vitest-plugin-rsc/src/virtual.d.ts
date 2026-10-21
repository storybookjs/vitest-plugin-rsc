declare module "virtual:vitest-plugin-rsc/vite-client" {
  export const createHotContext: unknown;
}

declare module "virtual:vitest-plugin-rsc/layers" {
  /**
   * What a static build made of the environments that the page runs through
   * a module runner, by the name of each, in the order a tab fetches their
   * files: the browser layer first. See built-layers.ts. Nothing with a dev
   * server.
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

declare module "virtual:vitest-plugin-rsc/host-modules" {
  /**
   * In a static build: how to load each module of the page that a layer of
   * the module runner imports, by the URL it imports it by, from the host's
   * build. Its default export is the module. Nothing with a dev server: see
   * host-module.ts.
   */
  const hostModules: Record<string, () => Promise<unknown>> | undefined;
  export default hostModules;
}

declare module "readable-stream" {
  /** The streams of Node.js as a package: see src/node/stream.ts. */
  export const Stream: typeof import("node:stream") & Record<string, any>;
  export default Stream;
}

declare module "assert/build/internal/util/comparisons.js" {
  export const isDeepStrictEqual: typeof import("node:util").isDeepStrictEqual;
}

declare module "util/support/types.js" {
  const types: typeof import("node:util").types;
  export default types;
}

declare module "string_decoder/lib/string_decoder.js" {
  export const StringDecoder: typeof import("node:string_decoder").StringDecoder;
}

declare module "events/events.js" {
  /** The EventEmitter of Node.js for a browser: see src/node/events.ts. */
  const EventEmitter: typeof import("node:events").EventEmitter;
  export default EventEmitter;
}

// Node's `path`, for a browser: no types of its own.
declare module "path-browserify" {
  const path: typeof import("node:path");
  export default path;
}

// The util and assert packages, Node's own for a browser, by their files.
declare module "util/util.js" {
  const util: Record<string, any>;
  export default util;
}
declare module "assert/build/assert.js" {
  const assert: typeof import("node:assert");
  export default assert;
}
