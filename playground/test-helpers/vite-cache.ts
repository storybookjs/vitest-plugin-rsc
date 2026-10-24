// The `cacheDir` of the playgrounds that run Vitest on Bun (`bun --bun vitest`,
// their `test:run:bun`; see "Start sooner on Bun" in docs/nextjs-guide.md): a
// dependency cache of its own on Bun. Vite's hash of the config stringifies its functions, which
// Bun prints differently from Node, so the cache of one runtime is stale for
// the other, and every switch would optimize the dependencies again.
export const cacheDir = process.versions.bun ? "node_modules/.vite-bun" : undefined;
