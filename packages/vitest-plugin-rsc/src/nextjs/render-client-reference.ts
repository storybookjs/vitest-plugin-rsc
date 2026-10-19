import * as React from "react";
import { holdAct, outsideRender } from "./act-hold.ts";
import { calledOnTheServer, isClientReference, keyAndNameOf } from "./client-reference.ts";
import { fulfilled, track, type Thenable } from "./thenable.ts";

// The browser layer's half of a client reference that its React renders in
// the document of the host, see client-proxy.ts. It runs in the tab's graph
// of client-graph.ts, so `react` here is the one of that graph: the React
// that renders, whose `use()` suspends the proxy until the file has loaded.
//
// Then it renders the export as Flight renders a reference it has resolved:
// `createElement(export, props)`, never the export called, which would give
// a plain function two meanings, one in a Server Component and another here.
// And with the props as Flight delivers them: every client reference in
// them is the export too, as an element's type and as a value. So browser
// code sees what it imports, `child.type === TabPanel`, a static of a
// component, a context, a function it calls; server code sees references.

/**
 * Loads the file with a reference key in the tab's graph, and links its
 * stylesheets before the thenable resolves: the same thenable for a key, as
 * long as the graph has the module.
 */
export type LoadReference = (key: string) => Thenable<Record<string, unknown>>;

type Element = {
  type: unknown;
  key: string | null;
  props: Record<string, unknown>;
  _store?: { validated?: unknown };
};

const elementTags = new Set<unknown>([
  Symbol.for("react.transitional.element"),
  Symbol.for("react.element"),
]);
// How many objects a walk of the props of a reference looks at, at most.
const maxVisited = 2000;

const isElement = (value: object): value is Element =>
  elementTags.has(Reflect.get(value, "$$typeof"));

const isPlainObject = (value: object) => {
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

/**
 * `element` with another type and props, as React makes an element: with
 * its key, its ref, which is a prop, and the mark that React checked its
 * key as a static child, so that it does not warn about it again.
 */
function elementWith(element: Element, type: unknown, props: Record<string, unknown>): Element {
  const config: Record<string, unknown> = { ...props };
  if (element.key !== null) config.key = element.key;
  const made = React.createElement(type as React.ElementType, config) as unknown as Element;
  if (element._store && made._store) made._store.validated = element._store.validated;
  return made;
}

/**
 * `value` with `replace(reference)` for every client reference in it: in
 * arrays, plain objects and elements, as an element's type and as a value.
 * What has none in it stays the same object. An element whose type is server
 * code, a Server Component, is what Flight would have rendered on the server:
 * its props are its own, and it stays as it is unless `intoServerCode`, for
 * a walk that only looks. Stops after `maxVisited` objects. A cycle keeps
 * the object it comes back to as it is.
 */
function mapReferences(
  value: unknown,
  replace: (reference: object) => unknown,
  intoServerCode: boolean,
): unknown {
  let visited = 0;
  const mapped = new Map<object, unknown>();

  const visit = (value: unknown): unknown => {
    if (isClientReference(value)) return replace(value);
    if (typeof value !== "object" || value === null) return value;
    if (mapped.has(value)) return mapped.get(value);
    if (visited++ >= maxVisited) return value;
    mapped.set(value, value);
    const result = mapObject(value);
    mapped.set(value, result);
    return result;
  };

  const mapObject = (value: object): unknown => {
    if (Array.isArray(value)) {
      const items = value.map(visit);
      return items.some((item, index) => item !== value[index]) ? items : value;
    }
    if (isElement(value)) return mapElement(value);
    if (!isPlainObject(value)) return value;
    const entries = Object.entries(value);
    const results = entries.map(([name, item]) => [name, visit(item)] as const);
    const changed = results.some(([, item], index) => item !== entries[index]![1]);
    return changed ? Object.fromEntries(results) : value;
  };

  const mapElement = (element: Element): unknown => {
    const { type } = element;
    const reference = isClientReference(type);
    const ownCode = reference || typeof type === "string" || typeof type === "symbol";
    if (!ownCode && !intoServerCode) return element;
    const newType = reference ? replace(type) : type;
    const props = visit(element.props) as Record<string, unknown>;
    if (newType === type && props === element.props) return element;
    return elementWith(element, newType, props);
  };

  return visit(value);
}

/** The reference keys of the client references in `props`, also those a Server Component has. */
function referenceKeysIn(props: object): string[] {
  const keys = new Set<string>();
  mapReferences(props, (reference) => (keys.add(keyAndNameOf(reference).key), reference), true);
  return [...keys];
}

/** `props` with each client reference in it as `exportOf(reference)`. */
const withExports = (props: object, exportOf: (reference: object) => unknown) =>
  mapReferences(props, exportOf, false) as object;

/**
 * What `registry.renderClientReference` is in the tab: renders the export
 * `name` of the file with the key `key`, with `props`, while the proxy of
 * the reference renders. Suspends once for a tree whose references are
 * elements already: until every one of them has settled.
 */
export function createRenderClientReference(load: LoadReference) {
  // By the keys of a tree, in order: one thenable for each, so that the
  // proxy passes the same one to `use()` every time it renders, also after
  // it has settled, which React reads synchronously. A new one once a load
  // of it is new, after the graph forgot the key.
  const trees = new Map<string, { loads: Thenable<unknown>[]; tree: Thenable<unknown> }>();
  const treeOf = (key: string, keys: readonly string[]) => {
    const ordered = [key, ...keys.filter((other) => other !== key).sort()];
    const id = ordered.join("\n");
    const loads = ordered.map(load);
    const known = trees.get(id);
    if (known?.loads.every((loading, index) => loading === loads[index])) return known.tree;
    const own = loads[0]!;
    // The tree waits for every load to settle, not to succeed: a reference
    // whose file failed to load throws where it renders, inside the error
    // boundary around it, not in the reference whose props have it.
    const settled = loads.every(({ status }) => status === "fulfilled" || status === "rejected");
    const tree = !settled
      ? track(Promise.allSettled(loads).then(() => own))
      : own.status === "fulfilled"
        ? fulfilled(own.value!)
        : own;
    trees.set(id, { loads, tree });
    return tree;
  };

  // By the props object of a reference, which React keeps from render to
  // render: also in StrictMode, and for a `memo` that compares them.
  const keysOf = new WeakMap<object, string[]>();
  const resolvedOf = new WeakMap<object, { tree: Thenable<unknown>; props: object }>();

  // The export for a reference, once its file has loaded. One that failed
  // to load stays the reference, which throws the error where it renders.
  const exportOf = (reference: object): unknown => {
    const { key, name } = keyAndNameOf(reference);
    const loading = load(key);
    return loading.status === "fulfilled" && name in loading.value!
      ? loading.value![name]
      : reference;
  };

  return function renderClientReference(key: string, name: string, props: object): unknown {
    if (outsideRender()) throw calledOnTheServer(`${key}#${name}`);
    let keys = keysOf.get(props);
    if (!keys) keysOf.set(props, (keys = referenceKeysIn(props)));
    const tree = treeOf(key, keys);
    holdAct(tree);
    // Every render, also once it has loaded: React tells a component that
    // suspended and did not call `use()` again when it finished.
    const exports = React.use(tree as Promise<Record<string, unknown>>);
    if (!(name in exports)) {
      throw new Error(`vitest-plugin-rsc: ${key} has no export "${name}" in the browser layer.`);
    }
    let resolved = resolvedOf.get(props);
    if (resolved?.tree !== tree) {
      resolved = { tree, props: withExports(props, exportOf) };
      resolvedOf.set(props, resolved);
    }
    return React.createElement(exports[name] as React.ElementType, resolved.props);
  };
}
