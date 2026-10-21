// The entry of a host that uses its own files, and not the server's API:
// `loadClientModule()` for the Client Components of one with `"use client"`,
// `linkStylesheetsOf()` for the CSS of any, and `keepHostDocument()` while it
// renders them. It loads no layer of Next's server as it evaluates, and
// leaves the document's APIs as they are: a component that the host renders
// as React does has the browser's own `fetch`, cookies and storage, as in a
// browser without the app. A host that renders a page or a node of the app
// imports `vitest-plugin-rsc/nextjs/testing-library`, which opens a browser
// context of the app for it.

// The server's platform, which loading a file reads: see internal.ts.
import "./globals.ts";

export { linkStylesheetsOf, loadClientModule } from "./client-graph.ts";
export { keepHostDocument } from "./host-document.ts";
