// What a page of the host leaves on `window` for its test: see
// test/host.test.ts.
export type HostWindow = {
  __hostState?: "ready" | "error";
  __hostError?: unknown;
  __hostResponse?: { status: number; url: string };
  __hostReports?: unknown[];
  /** Whether the callout had its stylesheet, before `?view=switch` left it. */
  __hostCalloutLinked?: boolean;
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
