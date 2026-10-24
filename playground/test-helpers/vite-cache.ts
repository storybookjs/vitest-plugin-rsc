// The `cacheDir` of the playgrounds that run Vitest on Bun (`bun --bun vitest`,
// see playground/vitest-vs-playwright-notes/README.md): a dependency cache of
// its own on Bun. Vite's hash of the config stringifies its functions, which
// Bun prints differently from Node, so the cache of one runtime is stale for
// the other, and every switch would optimize the dependencies again.
export const cacheDir = process.versions.bun ? "node_modules/.vite-bun" : undefined;
