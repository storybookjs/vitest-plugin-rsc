/**
 * The browser command the tab calls for what a test file loads without an
 * import of its own: see tab.ts. Not a name with `__vitest` in front: Vitest
 * keeps those from the tab.
 */
export const loadedCommand = "vitestPluginRscRouteLoaded";

/** A page or a route handler, by its entry, or the module of a Server Action. */
export type LoadedKind = "page" | "route" | "action";
