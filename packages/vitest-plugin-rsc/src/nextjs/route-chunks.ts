import type { Rolldown } from "vite";

// The chunks of the rsc layer that a page route of a static build loads,
// which a page load starts at once (rsc.ts): read off the chunks of the
// build, as a browser does not fetch what a module imports before it has the
// module, and Next loads the module of a segment only once it has the one
// around it.

/**
 * For each route, by the ids of the modules it loads first, its entry and
 * what its loader tree imports: the files of their chunks, the entry's first,
 * and of every chunk those import, but none that `lists` and what they import
 * are in, which the page has before it loads a route. Not the chunk of a
 * module that one of them imports with `import()`: that is the app's to load.
 */
export function routeChunksOf(
  bundle: Rolldown.OutputBundle,
  lists: string[],
  routes: Iterable<[route: string, ids: string[]]>,
): Map<string, string[]> {
  const chunkOf = new Map<string, Rolldown.OutputChunk>();
  for (const output of Object.values(bundle)) {
    if (output.type !== "chunk") continue;
    for (const id of output.moduleIds) chunkOf.set(id, output);
  }
  const chunksOf = (ids: string[], had = new Set<string>()) => {
    const loaded = new Set<string>();
    const visit = (chunk: Rolldown.OutputChunk | undefined): void => {
      if (!chunk || had.has(chunk.fileName) || loaded.has(chunk.fileName)) return;
      loaded.add(chunk.fileName);
      for (const fileName of chunk.imports) {
        const imported = bundle[fileName];
        if (imported?.type === "chunk") visit(imported);
      }
    };
    ids.forEach((id) => visit(chunkOf.get(id)));
    return loaded;
  };
  const had = chunksOf(lists);
  return new Map(Array.from(routes, ([route, ids]) => [route, [...chunksOf(ids, had)]]));
}
