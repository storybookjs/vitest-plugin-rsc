// What a page of the host leaves on `window` for its test: see
// test/host.test.ts.
export type HostWindow = {
  __hostState?: "ready" | "error";
  __hostError?: unknown;
  __hostResponse?: { status: number; url: string };
  __hostReports?: unknown[];
  /** What `loadClientModule()` gave `?view=module`. */
  __hostModule?: {
    /** Whether the rsc layer's module of the file has references, not the components. */
    reference: boolean;
    /** Whether a second call gave the same exports. */
    same: boolean;
    /**
     * Whether the module of another import of the file gave other exports.
     * Not in a static build, which has one module of the file.
     */
    again?: boolean;
    /** Whether the first module kept its own after that. */
    kept: boolean;
    /** Whether a module without the directive came back as it is. */
    plain: boolean;
    /** What it did for a file of the app: its error. */
    app: string;
  };
  /** Whether the callout had its stylesheet, before `?view=switch` left it. */
  __hostCalloutLinked?: boolean;
  /** For `?view=references`: see main.tsx. */
  __hostReferences?: {
    /** What a `play` function sees once the render resolved. */
    atResolve: ReferencesSeen;
    refs: (string | null)[];
    directEvaluation: string;
    resolve(value: string): void;
    /** Renders the tree again, and says what is there once that resolved. */
    rerender(order: string[], added?: boolean): Promise<ReferencesSeen>;
  };
  /** For `?view=references-failed`: what the boundary showed as `act()` resolved, and caught. */
  __hostFailed?: { atResolve: string | null; caught: string[] };
  /** For `?view=references-reimported`: the evaluations rendered, and of each import. */
  __hostReimported?: { before?: string; after?: string; first: string; again: string };
  /** For `?view=references-called`: what calling a reference did. */
  __hostCalled?: string;
  /** For `?view=act-canary`: whether React's own `act()` waited for a root that suspended. */
  __hostActCanary?: boolean;
  /** For `?view=rerender`: renders the greeting again for another name. */
  __hostRerender?: (name: string) => Promise<void>;
};

/** What a `play` function sees of `?view=references` at once. */
export type ReferencesSeen = { counter: string | null; late: boolean; added: boolean };

export const state = window as HostWindow;

/** Runs what the page shows, and says on `window` whether it did. */
export async function show(run: () => Promise<void>): Promise<void> {
  try {
    await run();
    state.__hostState = "ready";
  } catch (error) {
    state.__hostState = "error";
    state.__hostError = error;
    console.error(error);
  }
}
