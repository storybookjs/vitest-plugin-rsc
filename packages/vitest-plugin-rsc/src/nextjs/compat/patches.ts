// What the plugin changes in Next's own code: `nextPatchesPlugin()` of
// plugin.ts applies these. Each edit replaces every `find` in a file of Next
// with `replace`. The code it adds reads the registry (registry.ts) as it runs,
// so that the pre-bundled files are the same in either mode, with any speed
// features, and with HTML of the server and without. A `find` that a version of
// Next no longer has leaves its file as it is, with a warning that says what
// then does not work: see `lost`.
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
  // The kept app of `keepApp` renders every page with a router of its own
  // (`renderAgain()` in client.tsx). Next creates the action queue of its
  // router once per page load, and throws when it is created again.
  {
    file: /\/next\/dist\/esm\/client\/components\/app-router-instance\.js$/,
    lost: "`keepApp` cannot render a page in the kept app",
    edits: [
      [
        "if (globalActionQueue !== null) {",
        `if (globalActionQueue !== null && !${registry}?.replacingRouter) {`,
      ],
    ],
  },
  // Next reports an error that no boundary of the app caught with
  // `reportError()`, which it takes as its module loads. A test spies on it
  // before it opens a page, with `vi.spyOn(window, "reportError")`: a page
  // load has modules of its own, but the kept app of `keepApp` loaded them at
  // the first page of the test file, before the spy, and Next would report to
  // the `reportError()` of then. It looks the function up as it reports.
  {
    file: /\/next\/dist\/esm\/client\/react-client-callbacks\/report-global-error\.js$/,
    lost: "with `keepApp`, a spy on `window.reportError` misses the errors of a page",
    edits: [["reportError : (error)=>{", "(error)=>reportError(error) : (error)=>{"]],
  },
  // React DOM, in development, warns once that a `<script>` it renders on the
  // client never runs. A page without HTML of the server, like every page of
  // `keepApp`, renders on the client what the server would have rendered as
  // HTML, like the inline script of a theme: the warning is the plugin's doing,
  // not the app's. A page that hydrates gets it as it would in the app.
  {
    file: /\/next\/dist\/compiled\/react-dom\/cjs\/react-dom-(?:client|profiling)\.development\.js$/,
    lost: "a page without HTML of the server warns of the `<script>` elements of the app",
    edits: [
      [
        "didWarnScriptTags ||",
        `didWarnScriptTags || ${registry}?.speedFeatures?.keepApp || ${registry}?.opened?.ssr === false ||`,
      ],
    ],
  },
];
