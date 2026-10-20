import { isCSSRequest, type EnvironmentModuleNode } from "vite";

// How far a change of a module goes up its module graph, for the walks that
// decide what a change of a file changes: the modules that import it, also
// through other modules, but not through a stylesheet.
//
// In Vite's graph a stylesheet imports every file that its CSS depends on:
// a PostCSS plugin, like Tailwind's, makes each file it scans for class
// names one, a story file too. A change of such a file is a change of the
// stylesheet's CSS, which Vite updates, and no change of the code that
// imports the stylesheet. What a page renders of the file is code that a
// route imports, which a walk reaches by the imports of that code.

/**
 * `modules` and the modules that import them, also through other modules,
 * but not through a stylesheet that depends on one of them: see above.
 */
export function* importersOf(
  modules: Iterable<EnvironmentModuleNode>,
): Generator<EnvironmentModuleNode> {
  const seen = new Set(modules);
  for (const node of seen) {
    yield node;
    for (const importer of node.importers) if (!isCSSRequest(importer.url)) seen.add(importer);
  }
}
