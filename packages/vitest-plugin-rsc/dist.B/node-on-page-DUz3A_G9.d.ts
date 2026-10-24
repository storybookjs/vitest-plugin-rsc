//#region src/nextjs/node-on-page.d.ts
/**
 * What `NodeRendered` tells the node of its page. A shape, not the class:
 * node-rendered.tsx is an entry of its own in the package, whose types have
 * a copy of the class, and a class with private fields is only itself.
 */
type NodeReports = Pick<NodeOnPage, "mounted" | "shown" | "hidden">;
declare class NodeOnPage {
  #private;
  constructor(pathname: string);
  /**
   * Renders the node again: `swap` puts the node with the next version where
   * the server reads it, and then Next's router asks the server for the page
   * again, one request for every call. Resolves once the page has committed
   * that version or a later one, and run its effects. Rejects at once, and
   * later, when the page no longer has the node.
   */
  rerender(swap: (version: number) => void): Promise<void>;
  /** The page is at `pathname` now. At another than the node's, the node is not there. */
  at(pathname: string): void;
  /** From the page, in the commit that mounts the node: its router. */
  mounted(refresh: () => void): void;
  /**
   * From the page, from a passive effect, after the effects of the node: it
   * shows the node at `version`.
   */
  shown(version: number): void;
  /** From the page: the node is no longer shown. Something else may be in its place. */
  hidden(): void;
  /**
   * From the root of the page: React reported an error. For a node that is
   * mounted, a boundary in it shows the error, or one around it does and the
   * node is no longer shown. One that is not mounted by the end of the commit
   * never will be: an error took its place before it hydrated.
   */
  errored(error: unknown): void;
  /** Something else is in the node's place: a page it redirected to, an error page. */
  replaced(): void;
  /**
   * The page was left: by `cleanup()`, `unmount()`, another `renderServer()`,
   * the app or the dev server.
   */
  left(by: string): void;
}
//#endregion
export { NodeReports as n, NodeOnPage as t };