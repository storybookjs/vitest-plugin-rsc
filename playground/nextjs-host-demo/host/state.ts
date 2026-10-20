// What a page of the host leaves on `window` for its test: see
// test/host.test.ts.
export type HostWindow = {
  __hostState?: "ready" | "error";
  __hostError?: unknown;
  __hostResponse?: { status: number; url: string };
  __hostReports?: unknown[];
  /** What the Client Component of `?view=tag` tagged, through `host-report/tags`. */
  __hostTags?: string[];
  /** What `loadClientModule()` gave `?view=module`. */
  __hostModule?: {
    /** Whether the rsc layer's module of the file has references, not the components. */
    reference: boolean;
    /** Whether a second call gave the same exports. */
    same: boolean;
    /**
     * Whether the module of another import of the unchanged file gave the
     * same exports. Not in a static build, which has one module of the file.
     */
    again?: boolean;
    /** Whether a module without the directive came back as it is. */
    plain: boolean;
    /** What it did for a file of the app: its error. */
    app: string;
  };
  /** For `?view=after-page`: whether the stylesheet of the badge was linked, at each step. */
  __hostBadgeLinked?: Record<string, boolean>;
  /**
   * For `?view=in-place`: whether the host's own read of in-place-note.tsx
   * has the object that in-place-badge.tsx imports of it.
   */
  __hostOneNote?: boolean;
  /** Whether the callout had its stylesheet, before `?view=switch` left it. */
  __hostCalloutLinked?: boolean;
  /** For `?view=rerender`: renders the greeting again for another name. */
  __hostRerender?: (name: string) => Promise<void>;
  /** For `?view=early`: the status of the `fetch` of a file of the host. */
  __hostFetched?: number;
  /** For `?view=early`: when it was done, by `performance.now()`. */
  __hostReadyAt?: number;
  /**
   * For `?view=early`: sends a request to the app with `handleRequest()`, and
   * resolves with the status of the response, or the name of the error.
   */
  __hostRequest?: (path: string) => Promise<number | string>;
  /** For `?view=early`: the plugin's `cleanup()`. */
  __hostCleanup?: () => Promise<void>;
  /**
   * For `?view=early`: renders a node that counts its renders on the server,
   * and resolves with `"rendered"`, or the name of the error.
   */
  __hostRenderProbe?: () => Promise<string>;
  /** For `?view=early`: how often the server rendered that node. */
  __hostProbeRenders?: number;
};

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
