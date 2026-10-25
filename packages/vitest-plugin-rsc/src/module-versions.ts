import type { EnvironmentModuleGraph, EnvironmentModuleNode, ViteDevServer } from "vite";

// The version of the modules of an environment, and which of them changed
// after a version, as Vite's module graph has them. A page keeps the modules
// it fetched for its next page loads for as long as the version stays, and a
// runner that outlives a page load evaluates again what changed: see
// utils.ts.

// When Vite last invalidated the module, or 0: for a change of its file, or
// of a module it imports, also through others, and when a plugin says so.
// Each invalidation takes a new time from Vite's clock, and a change of a
// file stamps its modules and their importers as Vite sees it, before its
// HMR does.
const invalidatedAt = (node: EnvironmentModuleNode) =>
  Math.max(node.lastInvalidationTimestamp, node.lastHMRTimestamp);

/** When Vite last invalidated a module of the graph, or 0. */
export function versionOf(graph: EnvironmentModuleGraph | undefined): number {
  let version = 0;
  for (const node of graph?.idToModuleMap.values() ?? []) {
    version = Math.max(version, invalidatedAt(node));
  }
  return version;
}

/** The ids of the modules of the graph that Vite invalidated after `version`. */
export function changedAfter(graph: EnvironmentModuleGraph | undefined, version: number): string[] {
  const changed: string[] = [];
  for (const [id, node] of graph?.idToModuleMap ?? []) {
    if (invalidatedAt(node) > version) changed.push(id);
  }
  return changed;
}

/**
 * Calls `changed` with the name of an environment in the microtask after Vite
 * invalidated modules of it: once, however many modules an invalidation
 * reaches, like `invalidateAll()` of the optimizer. So before any answer to
 * the page that the server makes after the invalidation, which it sends after
 * an `await` at the least.
 *
 * Every invalidation goes through the graph's `invalidateModule()`: a change
 * of a file that Vite's watcher sees, one that Vitest's watcher tells the
 * graph of itself, which a plugin hears of in no hook, the optimizer's, and
 * a plugin's own. So that is where it is heard.
 */
export function onInvalidation(server: ViteDevServer, changed: (environment: string) => void) {
  const pending = new Set<string>();
  const flush = () => {
    const environments = [...pending];
    pending.clear();
    environments.forEach(changed);
  };
  for (const [name, { moduleGraph }] of Object.entries(server.environments)) {
    const invalidate = moduleGraph.invalidateModule;
    moduleGraph.invalidateModule = function (...args) {
      if (pending.size === 0) queueMicrotask(flush);
      pending.add(name);
      return invalidate.apply(this, args);
    };
  }
}
