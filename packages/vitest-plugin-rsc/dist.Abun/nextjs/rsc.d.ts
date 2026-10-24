//#region src/nextjs/rsc.d.ts
/** The page module of the route of a node: see `loadNodeEntry()` in project/entries.ts. */
declare function loadComponent(): Promise<{
  default: () => unknown;
}>;
declare global {
  var __vite_rsc_require__: (id: string) => Promise<unknown>;
}
/**
 * Next's `__next_app__.require`: the module loader of the server bundle, which
 * holds the modules of both server layers. React's Flight codec calls it for a
 * reference in a payload, and Next calls it for the module of a Server Action.
 *
 * Like webpack's, it returns the same promise for the same id: React keeps the
 * state of a module on that promise.
 */
declare function requireModule(id: string): Promise<unknown>;
//#endregion
export { loadComponent, requireModule };