// What Vite RSC makes of a file with `"use client"` in the rsc layer: a client
// reference module. Each of its exports is React's client reference of that
// name, `registerClientReference(proxy, key, name)`, which runs none of the
// code of the file: a value with React's tag as its `$$typeof`, and
// `<key>#<name>` as its `$$id`. The key is the file's reference key, which
// with a dev server is its URL in the browser layer, and in a build a hash.

const clientReferenceTag = Symbol.for("react.client.reference");

/** Whether `value` is React's client reference. */
export function isClientReference(value: unknown): value is object {
  return (
    (typeof value === "function" || (typeof value === "object" && value !== null)) &&
    Reflect.get(value, "$$typeof") === clientReferenceTag
  );
}

/** The reference key and the export name of a client reference: its `$$id`. */
export function keyAndNameOf(reference: object): { key: string; name: string } {
  const id = String(Reflect.get(reference, "$$id"));
  const hash = id.lastIndexOf("#");
  return { key: id.slice(0, hash), name: id.slice(hash + 1) };
}

/**
 * What a client reference throws where it is called as a function, or where
 * a React renders it that is not the browser layer's of the tab, like a
 * page's: `id` is `<key>#<name>`.
 */
export function calledOnTheServer(id: string): Error {
  return new Error(
    `${id} is a Client Component and cannot be called on the server. It renders as an ` +
      `element: in a Server Component through Flight, and else by the React of the browser ` +
      `layer in the document of the host.`,
  );
}

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
    if (!isClientReference(value)) return;
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
 * render-client-reference.ts. An entry of the browser layer, like
 * `vitest-plugin-rsc/nextjs/client`, and like it no API.
 */
export const rendererModule = "vitest-plugin-rsc/nextjs/render-client-reference";
