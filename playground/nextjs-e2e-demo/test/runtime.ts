declare const __NEXT_RUNTIME__: "edge" | "nodejs";

/**
 * Which of Next's server runtimes this run compiles the server for: see
 * VITEST_PLUGIN_RSC_NEXT_RUNTIME in vitest.config.ts. A few answers differ.
 */
export const nextRuntime = __NEXT_RUNTIME__;
