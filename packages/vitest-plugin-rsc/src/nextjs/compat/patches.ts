// What the plugin changes in Next's own code: `nextPatchesPlugin()` of
// plugin.ts applies these. Each edit replaces every `find` in a file of Next
// with `replace`. The code it adds reads the registry (registry.ts) as it
// runs, so that the pre-bundled files are the same with fast mode and
// without, and with HTML of the server and without. A `find` that a version
// of Next no longer has leaves its file as it is, with a warning that says
// what then does not work: see `lost`.
export type NextPatch = {
  file: RegExp;
  /** What does not work without the patch. */
  lost: string;
  edits: [find: string, replace: string][];
};

const appRender = /\/next\/dist\/esm\/server\/app-render\/app-render\.js$/;

/**
 * The patches of Next's files, with `registry` the expression of the registry
 * in the code they add.
 */
export const nextPatches = (registry: string): NextPatch[] => [
  // `renderServer({ url, ssr: false })`: Next's renderer renders no HTML of
  // the page, only an empty document, as it does for an error page, with the
  // Flight payload in its scripts. Next's client sees the document of an
  // error page and renders the app with `createRoot()` instead of hydrating.
  // The request's own: not one of another page, nor one the app or the test
  // sends while the page is open, like the page after a redirect.
  {
    file: appRender,
    lost: "`ssr: false` renders the HTML of the page anyway",
    edits: [
      [
        "workUnitAsyncStorage.run(requestStore, renderToWebFizzStream, appElement, fizzOptions)",
        `workUnitAsyncStorage.run(requestStore, renderToWebFizzStream, ` +
          `${registry}?.openedByRequest?.getStore()?.ssr === false ` +
          `? _jsx("html", { id: "__next_error__", children: _jsx("body", {}) }) ` +
          `: appElement, fizzOptions)`,
      ],
    ],
  },
  // A page of fast mode's kept app (`keepApp`, page.ts) has no use for a document,
  // not even the empty one of `ssr: false`: Next answers its request with
  // the Flight payload that it would inline in the document, as it is. See
  // `flightOnly` of `Opened`.
  {
    file: appRender,
    lost: "fast mode loads the empty document of every page",
    edits: [
      [
        "// This is a regular dynamic render\n",
        "// This is a regular dynamic render\n" +
          `if (${registry}?.openedByRequest?.getStore()?.flightOnly) { ` +
          `finishHtmlRender(); return reactServerResult.consume(); }\n`,
      ],
    ],
  },
  // The kept app of fast mode renders every page with a router of its own
  // (`renderAgain()` in client.tsx). Next creates the action queue of its
  // router once per page load, and throws when it is created again.
  {
    file: /\/next\/dist\/esm\/client\/components\/app-router-instance\.js$/,
    lost: "fast mode cannot render a page in the kept app",
    edits: [
      [
        "if (globalActionQueue !== null) {",
        `if (globalActionQueue !== null && !${registry}?.replacingRouter) {`,
      ],
    ],
  },
  // With fast mode's `skipPrefetch`, `<Link>` and `<Form>` prefetch nothing. In production every
  // link that comes into view, and every link the pointer of a click passes,
  // is requested, and the server takes one request at a time: the click of a
  // test waited for them.
  {
    file: /\/next\/dist\/esm\/client\/components\/links\.js$/,
    lost: "fast mode prefetches",
    edits: [
      [
        "export function mountLinkInstance(element, href, router, fetchStrategy, prefetchEnabled, setOptimisticLinkStatus, ownerStack) {",
        "export function mountLinkInstance(element, href, router, fetchStrategy, prefetchEnabled, setOptimisticLinkStatus, ownerStack) {" +
          `\n    if (${registry}?.fast?.skipPrefetch) prefetchEnabled = false;`,
      ],
      [
        "export function mountFormInstance(element, href, router, fetchStrategy) {",
        "export function mountFormInstance(element, href, router, fetchStrategy) {" +
          `\n    if (${registry}?.fast?.skipPrefetch) return;`,
      ],
    ],
  },
  // In fast mode a navigation does not scroll to the segment that changed. To
  // find out whether it is in view, Next reads the layout of the document
  // after every navigation, which makes the browser lay it out then: about 2%
  // of the time of fast mode in a profile of the notes app. A test does not
  // see scrolling.
  {
    file: /\/next\/dist\/esm\/client\/components\/layout-router\.js$/,
    lost: "fast mode scrolls after a navigation",
    edits: [
      [
        "if (scrollRef === null || !scrollRef.current) return;",
        "if (scrollRef === null || !scrollRef.current) return;" +
          `\n        if (${registry}?.fast?.keepApp) {\n            scrollRef.current = false;\n            return;\n        }`,
      ],
    ],
  },
  // React DOM, in development, warns once that a `<script>` it renders on the
  // client never runs. A page without HTML of the server, like every page of
  // fast mode, renders on the client what the server would have rendered as
  // HTML, like the inline script of a theme: the warning is the plugin's doing,
  // not the app's. A page that hydrates gets it as it would in the app.
  {
    file: /\/next\/dist\/compiled\/react-dom\/cjs\/react-dom-(?:client|profiling)\.development\.js$/,
    lost: "a page without HTML of the server warns of the `<script>` elements of the app",
    edits: [
      [
        "didWarnScriptTags ||",
        `didWarnScriptTags || ${registry}?.fast?.keepApp || ${registry}?.opened?.ssr === false ||`,
      ],
    ],
  },
];
