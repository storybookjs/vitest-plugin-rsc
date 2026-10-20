import "./globals.ts";
import { createEnvironmentRunner, environmentModule, fetchLayerNow } from "../utils.ts";

// The layers of Next's server in the tab, in the order they load. The
// server's platform (globals.ts) has to be there before a module of Next's
// server loads, so they load from here on: rsc, then ssr. One module graph
// of each for the tab: the server stays, where a page is loaded anew.
await import("./rsc.ts");

/**
 * The ssr layer: Next's request handler and HTML renderer, see ssr.ts. It
 * starts to load once the rsc layer has, and what the host imports does not
 * wait for it: only what needs it does, a request that the server handles.
 * The server in front of the app needs none: see server-in-front.ts. A build
 * fetches its file after the browser layer's, unless a request needs it
 * first: see built-layers.ts.
 */
export const ssrLayer = createEnvironmentRunner("next_ssr").import<typeof import("./ssr.ts")>(
  environmentModule("next_ssr", "vitest-plugin-rsc/nextjs/ssr"),
);
// An error of the layer is one of the first request that needs it.
ssrLayer.catch(() => {});

/** The ssr layer, for a request that needs it now: a build fetches its file at once. */
export function ssrLayerNow(): typeof ssrLayer {
  fetchLayerNow("next_ssr");
  return ssrLayer;
}
