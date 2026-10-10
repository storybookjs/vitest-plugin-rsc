import {
  Component,
  createElement,
  use,
  useSyncExternalStore,
  type ComponentType,
  type ReactNode,
} from "react";
import { loadModule } from "./client-modules.ts";
import { registry, type ClientNode as Node } from "./registry.ts";

// The one Client Component of the page of a node of the browser layer: see
// `ClientNode` in registry.ts. It renders what the test or the story put in
// `registry`, as it is. Around it is Next's own app, so the router and its
// hooks are Next's.

function subscribe(changed: () => void): () => void {
  registry.clientNodeListeners.add(changed);
  return () => registry.clientNodeListeners.delete(changed);
}

const current = () => registry.clientNode;
// A client node is rendered in the browser only: the server's HTML has
// nothing for it, and it renders once the page has hydrated, as a component
// does that `next/dynamic` loads without `ssr`. The ssr layer could render a
// node that names a module, which it can load: this would return it.
const onServer = () => undefined;

function Export({ node }: { node: Extract<Node, { module: string }> }): ReactNode {
  const loaded = use(loadModule(node.module)) as Record<string, ComponentType<object> | undefined>;
  const Component = loaded[node.name];
  if (!Component) {
    throw new Error(`vitest-plugin-rsc: ${node.module} has no export \`${node.name}\` to render`);
  }
  return createElement(Component, node.props);
}

// Tells who waits for the node that the page has it. A node that fails to
// render is not waited for either. The error is for the boundary of the app,
// as it is without this one.
class Rendered extends Component<{ node: Node; children?: ReactNode }, { error?: unknown }> {
  override state: { error?: unknown } = {};

  static getDerivedStateFromError(error: unknown): { error: unknown } {
    registry.clientNode?.rendered?.();
    return { error };
  }

  override componentDidMount(): void {
    this.props.node.rendered?.();
  }

  override render(): ReactNode {
    if ("error" in this.state) throw this.state.error;
    return this.props.children;
  }
}

export function ClientNode(): ReactNode {
  const node = useSyncExternalStore(subscribe, current, onServer);
  if (!node) return null;
  const content = "ui" in node ? (node.ui as ReactNode) : createElement(Export, { node });
  const wrapper = node.wrapper as ComponentType<{ children: ReactNode }> | undefined;
  return createElement(
    Rendered,
    { node },
    wrapper ? createElement(wrapper, null, content) : content,
  );
}

/**
 * For a module of the browser layer: imports another one in the module graph
 * of the page, by the id the layer has for it. That is what `import()` does
 * with a dev server. A static build only has the modules it was told of.
 */
export function importClientModule<T = unknown>(id: string): Promise<T> {
  return loadModule(id) as Promise<T>;
}
