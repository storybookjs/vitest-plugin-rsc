import type { EnvironmentModuleGraph, EnvironmentModuleNode } from "vite";

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
