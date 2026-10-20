import "./globals.ts";
import { createEnvironmentRunner, environmentModule } from "../utils.ts";

// The layers of Next's server in the tab. The server's platform (globals.ts)
// has to be there before a module of Next's server loads, so they load from
// here on. One module graph of each for the tab: the server stays, where a
// page is loaded anew. Nothing loads them as this module evaluates: an entry
// of the plugin that a host imports says when, see index.ts and
// client-components.ts.

type SsrLayer = typeof import("./ssr.ts");

/**
 * The rsc layer: Server Components, Server Actions, route handlers and the
 * Flight encoder, see rsc.ts. The document's own module graph.
 */
export function rscLayer(): Promise<unknown> {
  return import("./rsc.ts");
}

let loading: Promise<SsrLayer> | undefined;
let loaded: SsrLayer | undefined;

/**
 * The ssr layer: Next's request handler and HTML renderer, see ssr.ts, with
 * the rsc layer, which a request needs too. It starts to load the first time
 * something asks for it: a request that the server handles, or the entry of
 * the server's API as it evaluates. The server in front of the app needs
 * neither layer: see server-in-front.ts. A build fetches the layer's file
 * when its runner asks for it: see built-layers.ts.
 */
export function ssrLayer(): Promise<SsrLayer> {
  if (!loading) {
    // At once, both: what rsc.ts puts in `registry` the ssr layer reads
    // only as it handles a request.
    loading = Promise.all([
      rscLayer(),
      createEnvironmentRunner("next_ssr").import<SsrLayer>(
        environmentModule("next_ssr", "vitest-plugin-rsc/nextjs/ssr"),
      ),
    ]).then(([, layer]) => (loaded = layer));
    // An error of the layer is one of the first request that needs it.
    loading.catch(() => {});
  }
  return loading;
}

/** The ssr layer once it has loaded: until then there is nothing of it to settle or reset. */
export function loadedSsrLayer(): SsrLayer | undefined {
  return loaded;
}
