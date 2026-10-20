// The entry of a host that uses Client Components of its own files, and not
// the server's API: `loadClientModule()`, and `linkStylesheetsOf()` for
// their CSS. It loads no layer of Next's server as it evaluates. The server
// in front of the app is the document's all the same, so a request that a
// component sends to the app, like a `fetch` to a route handler, gets the
// app's answer: the first that the server handles loads the layers, see
// app-requests.ts. A host that renders a page or a node of the app imports
// `vitest-plugin-rsc/nextjs/testing-library`.

// The server's platform, which loading a file reads: see internal.ts.
import "./globals.ts";
import "./app-requests.ts";

export { linkStylesheetsOf, loadClientModule } from "./client-graph.ts";
