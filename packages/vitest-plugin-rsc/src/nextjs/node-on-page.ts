// The node of `renderServer(<Node />)` on its page, for `rerender()`: which
// render of it the page has committed, and whether the page still shows it.
// The page tells it from `NodeRendered`, which the server renders around the
// node (node-rendered.tsx), and from its root, which React tells of the
// errors it reports (client.tsx). One for every page of a node: a page that
// was left keeps telling its own, which nobody waits on any more.

type Waiting = {
  version: number;
  resolve(): void;
  reject(error: unknown): void;
};

/**
 * What `NodeRendered` tells the node of its page. A shape, not the class:
 * node-rendered.tsx is an entry of its own in the package, whose types have
 * a copy of the class, and a class with private fields is only itself.
 */
export type NodeReports = Pick<NodeOnPage, "mounted" | "shown" | "hidden">;

export class NodeOnPage {
  // The pathname of the node's route.
  #pathname: string;
  // The last render that `rerender()` asked for. The first one is the
  // document's.
  #version = 0;
  #waiting = new Set<Waiting>();
  // How many `NodeRendered` show the node: one, and for a moment none or two
  // in Strict Mode, which takes an effect down and up again at once.
  #shown = 0;
  // Next's router of the page, once the node is mounted. Before that it may
  // still hydrate, behind a Suspense boundary like a `loading.tsx`.
  #refresh: (() => void) | undefined;
  // What React reported since the last `rerender()` or commit of the node:
  // what took its place.
  #error: unknown;
  // Set once the page has no node to render again, with why.
  #gone: (() => Error) | undefined;

  constructor(pathname: string) {
    this.#pathname = pathname;
  }

  /**
   * Renders the node again: `swap` puts the node with the next version where
   * the server reads it, and then Next's router asks the server for the page
   * again, one request for every call. Resolves once the page has committed
   * that version or a later one, and run its effects. Rejects at once, and
   * later, when the page no longer has the node.
   */
  rerender(swap: (version: number) => void): Promise<void> {
    if (this.#gone) return Promise.reject(this.#gone());
    this.#error = undefined;
    const version = ++this.#version;
    swap(version);
    const committed = new Promise<void>((resolve, reject) => {
      this.#waiting.add({ version, resolve, reject });
    });
    this.#refresh?.();
    return committed;
  }

  /** The page is at `pathname` now. At another than the node's, the node is not there. */
  at(pathname: string): void {
    if (pathname !== this.#pathname) this.replaced();
  }

  /** From the page, in the commit that mounts the node: its router. */
  mounted(refresh: () => void): void {
    if (this.#gone) return;
    const first = !this.#refresh;
    this.#refresh = refresh;
    // A rerender that came while the node was still to hydrate.
    if (first && this.#waiting.size > 0) refresh();
  }

  /**
   * From the page, from a passive effect, after the effects of the node: it
   * shows the node at `version`.
   */
  shown(version: number): void {
    this.#shown++;
    if (this.#gone) return;
    this.#error = undefined;
    for (const waiting of this.#waiting) {
      if (waiting.version > version) continue;
      this.#waiting.delete(waiting);
      waiting.resolve();
    }
  }

  /** From the page: the node is no longer shown. Something else may be in its place. */
  hidden(): void {
    this.#shown--;
    // After the microtasks of this commit: Strict Mode, and a new version,
    // show the node again right away.
    void Promise.resolve().then(() => {
      if (this.#shown === 0) this.replaced();
    });
  }

  /**
   * From the root of the page: React reported an error. For a node that is
   * mounted, a boundary in it shows the error, or one around it does and the
   * node is no longer shown. One that is not mounted by the end of the commit
   * never will be: an error took its place before it hydrated.
   */
  errored(error: unknown): void {
    this.#error = error;
    // React reports it in the commit, before the effects of the node in it.
    void Promise.resolve().then(() => {
      if (!this.#refresh) this.replaced();
    });
  }

  /** Something else is in the node's place: a page it redirected to, an error page. */
  replaced(): void {
    if (this.#gone) return;
    const cause = this.#error;
    const error = () =>
      Object.assign(
        new Error(
          "vitest-plugin-rsc: rerender() renders the node again in its place, and the page has " +
            "something else there: an error or a not-found page, a page the node redirected to, " +
            "or a route the app navigated to. Render the node with renderServer() instead.",
          cause === undefined ? undefined : { cause },
        ),
        { name: "NodeReplacedError" },
      );
    this.#leave(error, error());
  }

  /** The page was left: by `cleanup()`, `unmount()`, another `renderServer()` or the app. */
  left(by: string): void {
    if (this.#gone) return;
    this.#leave(
      () =>
        new Error(
          `vitest-plugin-rsc: rerender() renders the node again on its page, which ${by} has ` +
            "left. Render the node with renderServer() instead.",
        ),
      new DOMException(
        `The page was left before the node had rendered again: by ${by}.`,
        "AbortError",
      ),
    );
  }

  #leave(gone: () => Error, reason: Error): void {
    this.#gone = gone;
    for (const waiting of this.#waiting) waiting.reject(reason);
    this.#waiting.clear();
  }
}
