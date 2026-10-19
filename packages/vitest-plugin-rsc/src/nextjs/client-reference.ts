// What Vite RSC makes of a file with `"use client"` in the rsc layer: a client
// reference module. Each of its exports is React's client reference of that
// name, `registerClientReference(proxy, key, name)`, which runs none of the
// code of the file: a value with React's tag as its `$$typeof`, and
// `<key>#<name>` as its `$$id`. The key is the file's reference key, which
// with a dev server is its URL in the browser layer, and in a build a hash.

const clientReferenceTag = Symbol.for("react.client.reference");

/**
 * The reference key of a client reference module: of the file it stands
 * for. Nothing for any other module: one with a value of its own, a
 * reference under another name than its own, the references of two files,
 * or no exports at all. A module that re-exports references of one file
 * under their own names is the same to tell as that file's module.
 */
export function clientReferenceKeyOf(module: object): string | undefined {
  let key: string | undefined;
  for (const name of Object.keys(module)) {
    const value: unknown = Reflect.get(module, name);
    if (typeof value !== "function" && (typeof value !== "object" || value === null)) return;
    if (Reflect.get(value, "$$typeof") !== clientReferenceTag) return;
    const id: unknown = Reflect.get(value, "$$id");
    const suffix = `#${name}`;
    if (typeof id !== "string" || !id.endsWith(suffix)) return;
    const own = id.slice(0, -suffix.length);
    if (key !== undefined && own !== key) return;
    key = own;
  }
  return key;
}

/**
 * The browser layer's half of a client reference that the tab's React
 * renders, by the id that the tab's graph imports it by: see
 * render-client-reference.ts. In a build it is an entry of the browser layer.
 */
export const rendererModule = "vitest-plugin-rsc/nextjs/render-client-reference";
