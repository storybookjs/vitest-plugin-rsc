import module from "node:module";

// Node's cache of the code it compiles, for what a run loads after the
// config: Next's build code, about 600 modules that the `config` hook of
// vitestPluginNext requires, and Playwright, which Vitest loads as it starts
// the browser. Compiling them is a third of what loading them costs, at every
// start of Vitest. The `vite` command turns the cache on as it starts, the
// `vitest` command does not, so it is turned on here, as the config imports
// the plugin. Where Node has it (22.8 and later), into the directory of
// `NODE_COMPILE_CACHE` or the system's temporary one, and not with
// `NODE_DISABLE_COMPILE_CACHE`. Node writes the cache as the process exits;
// a run in watch mode does not exit, so it is written after a while too, as
// Vite does.
try {
  module.enableCompileCache?.();
  setTimeout(() => {
    try {
      module.flushCompileCache?.();
    } catch {}
  }, 10_000).unref();
} catch {}
