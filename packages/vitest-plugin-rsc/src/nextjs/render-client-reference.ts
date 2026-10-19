import * as React from "react";

// The browser layer's half of a client reference that its React renders in
// the document of the host, see client-proxy.ts. It runs in the tab's graph
// of client-graph.ts, so `react` here is the one of that graph: the React
// that renders, whose `use()` suspends the proxy until the file has loaded.
// Then it renders the export as Flight renders a reference that it has
// resolved: `createElement(export, props)`. Never the export called, which
// would give a plain function two meanings: one in a Server Component, and
// another here.

/** A promise that React's `use()` reads synchronously once it has settled. */
export type Thenable<T> = Promise<T> & {
  status?: "pending" | "fulfilled" | "rejected";
  value?: T;
  reason?: unknown;
};

/**
 * Loads the file with a reference key in the tab's graph, and links its
 * stylesheets before the thenable resolves: the same thenable for a key, as
 * long as the graph has the module.
 */
export type LoadReference = (key: string) => Thenable<Record<string, unknown>>;

const elementTags = new Set([Symbol.for("react.transitional.element"), Symbol.for("react.element")]);
const clientReferenceTag = Symbol.for("react.client.reference");
// How far `referencesIn()` looks into the props of a reference.
const maxVisited = 2000;

type Internals = { H: unknown; actQueue: unknown[] | null; didUsePromise: boolean };
// React's own: the dispatcher of the render that is running, and the queue of
// `act()`. Read with care: nothing breaks when a version of React lacks them.
const internals = Reflect.get(
  React,
  "__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE",
) as Internals | undefined;

/**
 * The reference keys of the client references that the elements in `value`
 * render, as far as they are elements already: the children of a reference,
 * made in the rsc layer, and what they have as children. A Server Component
 * among them makes its elements as it renders, which this cannot see.
 */
function referencesIn(value: unknown, keys: Set<string>, visited = { count: 0 }): void {
  if (visited.count++ > maxVisited || typeof value !== "object" || value === null) return;
  if (Array.isArray(value)) {
    for (const item of value) referencesIn(item, keys, visited);
    return;
  }
  if (!elementTags.has(Reflect.get(value, "$$typeof") as symbol)) return;
  const { type, props } = value as { type: unknown; props: Record<string, unknown> };
  if (typeof type === "function" && Reflect.get(type, "$$typeof") === clientReferenceTag) {
    const id = String(Reflect.get(type, "$$id"));
    keys.add(id.slice(0, id.lastIndexOf("#")));
  }
  for (const prop of Object.values(props ?? {})) referencesIn(prop, keys, visited);
}

function fulfilled<T>(value: T): Thenable<T> {
  return Object.assign(Promise.resolve(value), { status: "fulfilled" as const, value });
}

function track<T>(promise: Promise<T>): Thenable<T> {
  const thenable = promise as Thenable<T>;
  thenable.status = "pending";
  promise.then(
    (value) => Object.assign(thenable, { status: "fulfilled", value }),
    (reason: unknown) => Object.assign(thenable, { status: "rejected", reason }),
  );
  return thenable;
}

/**
 * Holds an `act()` scope open until `thenable` settles, as it holds it for a
 * component that suspends on a promise that settles in a microtask. Without
 * it, `await act(() => root.render(...))` resolves while a reference is still
 * loading, before anything of the tree has committed: `act()` waits for the
 * work that React queued, and a suspended root has none queued.
 */
function holdAct(thenable: Thenable<unknown>): void {
  const queue = internals?.actQueue;
  if (!queue || thenable.status !== "pending") return;
  // Spike only: lets the host demo show what `act()` does without the hold.
  if (Reflect.get(globalThis, "__spikeNoActHold")) return;
  type Hold = () => Hold | null;
  const hold: Hold = () => {
    if (thenable.status !== "pending") return null;
    // What `use()` sets for a promise inside `act()`: the continuation stays
    // in the queue, which `act()` flushes again in the next task.
    internals!.didUsePromise = true;
    return hold;
  };
  queue.push(hold);
}

/**
 * What `registry.renderClientReference` is in the tab: renders the export
 * `name` of the file with the key `key`, with `props`, while the proxy of
 * the reference renders. Suspends once for a tree whose references are
 * elements already: until every one of them has loaded.
 */
export function createRenderClientReference(load: LoadReference) {
  // By the keys of a tree, in order: one thenable for each, so that the
  // proxy passes the same one to `use()` every time it renders, also after
  // it has settled. React reads a settled one synchronously.
  const trees = new Map<string, Thenable<Record<string, unknown>>>();
  const treeOf = (key: string, keys: Set<string>) => {
    const ordered = [key, ...[...keys].filter((other) => other !== key).sort()];
    const id = ordered.join("\n");
    let tree = trees.get(id);
    if (tree) return tree;
    const loads = ordered.map(load);
    const own = loads[0]!;
    if (loads.every((loading) => loading.status === "fulfilled")) tree = fulfilled(own.value!);
    else tree = track(Promise.all(loads).then(() => own));
    trees.set(id, tree);
    return tree;
  };

  return function renderClientReference(key: string, name: string, props: object): unknown {
    if (internals && internals.H === null) {
      throw new Error(
        `${key}#${name} is a Client Component and cannot be called on the server. It renders ` +
          `as an element, by the React of the browser layer.`,
      );
    }
    const keys = new Set<string>();
    referencesIn(props, keys);
    const tree = treeOf(key, keys);
    holdAct(tree);
    // Every render, also once it has loaded: React tells a component that
    // suspended and did not call `use()` again when it finished.
    const module = React.use(tree as Promise<Record<string, unknown>>);
    if (!(name in module)) {
      throw new Error(`vitest-plugin-rsc: ${key} has no export "${name}" in the browser layer.`);
    }
    return React.createElement(module[name] as React.ElementType, props);
  };
}
