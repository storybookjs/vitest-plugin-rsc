import { calledOnTheServer } from "./client-reference.ts";
import { registry } from "./registry.ts";

// The rsc layer has a file with `"use client"` as a client reference module:
// each export is React's client reference, `registerClientReference(proxy,
// key, name)`, see client-reference.ts. Flight never calls the proxy: it
// reads the reference's `$$id`. Everything else that renders the proxy is
// the React of the browser layer, in the document of the host: a host that
// makes JSX in the rsc layer, as a test does, and renders it with that
// React. There the proxy renders the export of the file that the browser
// layer has, as Flight would have: see render-client-reference.ts.
//
// This module has no state of its own: the registry is the tab's. Next's own
// files get it in their pre-bundle, where it is a copy (plugin.ts).

/**
 * The proxy of the client reference `<key>#<name>`: a function component
 * that renders the export `name` of the file with the reference key `key`
 * in the browser layer. Called any other way, as a function by server code,
 * it throws.
 */
export function clientProxy(key: string, name: string): (props: object) => unknown {
  // Named after the export, for React's component stacks.
  const proxy = {
    [name](props: unknown) {
      const render = registry.renderClientReference;
      if (!render || typeof props !== "object" || props === null) {
        throw calledOnTheServer(`${key}#${name}`);
      }
      return render(key, name, props);
    },
  }[name]!;
  return proxy as (props: object) => unknown;
}
