// The fixtures of Next's own e2e tests that the runner runs: a directory of
// `vercel/next.js` with an app and the test files that open it.

export type Fixture = {
  /** Also the name of the copy that the tests run in. */
  id: string;
  /** The directory of the app, in Next's repository. */
  dir: string;
  /** The test files to run, relative to `dir`. */
  tests: string[];
  /**
   * The directory of the app in `dir`, for a fixture whose test file keeps
   * its apps in directories of their own, like `fixtures/main`, and opens
   * each in a `describe` of its own. The runner runs the test files in a
   * copy of that app, and leaves the tests of the other apps out.
   */
  app?: string;
  /** What the fixture is here for. */
  area: Area;
  /** Packages its test lists as dependencies that its app does not import. */
  assumeInstalled?: string[];
  /**
   * Packages the app gets under another name than the one `package.json` of
   * the runner installs them by: another major of a package the runner has,
   * as an npm alias. The runner links them into `node_modules` of the copy.
   */
  linked?: Record<string, string>;
  /**
   * Options of `nextTestSetup()` that change the app before Next builds it,
   * and what the runner does to the copy of the fixture instead. Without it,
   * a test that passes such an option is reported as not applicable.
   */
  prepared?: {
    options: string[];
    remove?: string[];
    /** Files the runner writes to the copy, like a `next.config.js`. */
    write?: Record<string, string>;
    /**
     * For `nextConfig`: the values of the config the copy has. A test's
     * `nextConfig` that has another value is not the app that runs. A function
     * of it, like `rewrites`, is taken to be the one the copy has.
     */
    nextConfig?: Record<string, unknown>;
  };
};

export const areas = {
  basics: "Pages and rendering",
  navigation: "Navigation",
  actions: "Server Actions",
  "route-handlers": "Route handlers",
  "parallel-routes": "Parallel routes",
  interception: "Interception routes",
  boundaries: "not-found and error boundaries",
  metadata: "Metadata",
  font: "next/font",
  image: "next/image",
  css: "CSS",
  cache: "The Data Cache",
  routing: "The proxy, rewrites, redirects, trailingSlash",
  "request-apis": "Cookies, headers, draft mode and after()",
  ppr: "Partial Prerendering and the segment cache",
} as const;
export type Area = keyof typeof areas;

const appDir = (
  name: string,
  area: Area,
  tests: string[],
  rest: Partial<Fixture> = {},
): Fixture => ({
  id: name.replaceAll("/", "__"),
  dir: `test/e2e/app-dir/${name}`,
  tests,
  area,
  ...rest,
});

export const fixtures: Fixture[] = [
  appDir("hello-world", "basics", ["hello-world.test.ts"]),

  appDir("navigation", "navigation", ["navigation.test.ts"]),
  appDir("shallow-routing", "navigation", ["shallow-routing.test.ts"]),
  appDir("hooks", "navigation", ["hooks.test.ts"]),
  appDir("use-params", "navigation", ["use-params.test.ts"]),
  // Not `create-root-layout`, whose tests are for `next dev`, which writes the
  // root layout that the app lacks. The plugin rejects the app, as `next build`
  // does.
  appDir("navigation-focus", "navigation", ["navigation-focus.test.ts"]),
  appDir("navigation-layout-suspense", "navigation", ["navigation-layout-suspense.test.ts"]),
  appDir("navigation-redirect-import", "navigation", ["navigation-redirect-import.test.ts"]),
  appDir("navigation-with-queued-actions", "navigation", ["index.test.ts"]),
  appDir("router-autoscroll", "navigation", ["router-autoscroll.test.ts"]),
  appDir("root-layout", "navigation", ["root-layout.test.ts"]),
  appDir("root-layout-redirect", "navigation", ["root-layout-redirect.test.ts"]),
  appDir("root-layout-render-once", "navigation", ["index.test.ts"]),
  appDir("app-edge-root-layout", "navigation", ["index.test.ts"]),
  appDir("concurrent-navigations", "navigation", [
    "mismatching-prefetch.test.ts",
    "server-patch-history.test.ts",
  ]),
  appDir("layout-params", "navigation", ["layout-params.test.ts"]),
  appDir("use-selected-layout-segment-s", "navigation", ["use-selected-layout-segment-s.test.ts"]),
  appDir("dynamic-href", "navigation", ["dynamic-href.test.ts"]),
  appDir("rsc-redirect", "navigation", ["rsc-redirect.test.ts"]),
  appDir("search-params-react-key", "navigation", ["layout-params.test.ts"]),
  appDir("searchparams-reuse-loading", "navigation", ["searchparams-reuse-loading.test.ts"]),
  appDir("searchparams-static-bailout", "navigation", ["searchparams-static-bailout.test.ts"]),
  appDir("multi-value-search-params-stale", "navigation", [
    "multi-value-search-params-stale.test.ts",
  ]),
  appDir("rewrite-with-search-params", "navigation", ["rewrite-with-search-params.test.ts"]),

  // Not the `*-node-middleware` files, which run the same tests again with
  // a middleware on the Node.js runtime.
  appDir("actions", "actions", [
    "app-action.test.ts",
    "app-action-form-state.test.ts",
    "app-action-progressive-enhancement.test.ts",
  ]),
  appDir("actions-navigation", "actions", ["index.test.ts"]),
  appDir("actions-revalidate-remount", "actions", ["actions-revalidate-remount.test.ts"]),
  appDir("actions-unrecognized", "actions", ["actions-unrecognized.test.ts"]),
  appDir("server-actions-relative-redirect", "actions", [
    "server-actions-relative-redirect.test.ts",
  ]),

  appDir("app-simple-routes", "route-handlers", ["app-simple-routes.test.ts"]),
  // Not `app-custom-route-base-path.test.ts`, which runs the same tests
  // again under a `basePath`.
  appDir("app-routes", "route-handlers", ["app-custom-routes.test.ts"]),

  appDir("parallel-routes-layouts", "parallel-routes", ["parallel-routes-layouts.test.ts"]),
  appDir("parallel-routes-catchall", "parallel-routes", ["parallel-routes-catchall.test.ts"]),
  appDir("parallel-routes-breadcrumbs", "parallel-routes", ["parallel-routes-breadcrumbs.test.ts"]),
  appDir("parallel-routes-not-found", "parallel-routes", ["parallel-routes-not-found.test.ts"]),

  // Not these two, whose app `next build` rejects. Their tests start the app
  // themselves and read what the CLI prints:
  // - `canonical-interception-routes`, an interception route without the
  //   route it intercepts. The plugin rejects the app too.
  // - `interception-routes-output-export`, interception routes with
  //   `output: "export"`.
  appDir("interception-dynamic-segment", "interception", ["interception-dynamic-segment.test.ts"]),
  appDir("interception-dynamic-segment-middleware", "interception", [
    "interception-dynamic-segment-middleware.test.ts",
  ]),
  appDir("interception-dynamic-single-segment", "interception", [
    "interception-dynamic-single-segment.test.ts",
  ]),
  appDir("interception-middleware-rewrite", "interception", [
    "interception-middleware-rewrite.test.ts",
  ]),
  appDir("interception-route-prefetch-cache", "interception", [
    "interception-route-prefetch-cache.test.ts",
  ]),
  appDir("interception-routes-multiple-catchall", "interception", [
    "interception-routes-multiple-catchall.test.ts",
  ]),
  appDir("interception-routes-root-catchall", "interception", [
    "interception-routes-root-catchall.test.ts",
  ]),
  appDir("interception-segments-two-levels-above", "interception", [
    "interception-segments-two-levels-above.test.ts",
  ]),
  appDir("dynamic-interception-route-revalidate", "interception", [
    "dynamic-interception-route-revalidate.test.ts",
  ]),
  // The test runs the app with `trailingSlash` on and off, and the rewrites of
  // its `nextConfig`. The copy has them, with `trailingSlash` off.
  appDir(
    "parallel-routes-and-interception",
    "interception",
    ["parallel-routes-and-interception.test.ts"],
    {
      prepared: {
        options: ["nextConfig"],
        write: {
          "next.config.js": [
            "module.exports = {",
            "  trailingSlash: false,",
            "  async rewrites() {",
            "    return {",
            "      beforeFiles: [",
            "        { source: '/foo', destination: '/en/foo' },",
            "        { source: '/photos', destination: '/en/photos' },",
            "      ],",
            "    }",
            "  },",
            "}",
            "",
          ].join("\n"),
        },
        nextConfig: { trailingSlash: false },
      },
    },
  ),
  appDir("parallel-routes-and-interception-basepath", "interception", [
    "parallel-routes-and-interception-basepath.test.ts",
  ]),
  appDir("parallel-routes-and-interception-catchall", "interception", [
    "parallel-routes-and-interception-catchall.test.ts",
  ]),
  // The test runs the app with `collapseAdapterRoutes` on and off. The copy
  // has Next's default, on.
  appDir(
    "parallel-routes-and-interception-from-root",
    "interception",
    ["parallel-routes-and-interception-from-root.test.ts"],
    {
      prepared: {
        options: ["nextConfig"],
        nextConfig: { experimental: { collapseAdapterRoutes: true } },
      },
    },
  ),
  appDir("parallel-routes-and-interception-nested-dynamic-routes", "interception", [
    "parallel-routes-and-interception-nested-dynamic-routes.test.ts",
  ]),

  appDir("not-found-default", "boundaries", ["index.test.ts"]),
  // Not `not-found-with-pages-i18n`, which is for the Pages Router.
  appDir("not-found/basic", "boundaries", ["index.test.ts"]),
  appDir("not-found/conflict-route", "boundaries", ["index.test.ts"]),
  // The test lists `sass`, and the app has no Sass.
  appDir("not-found/css-precedence", "boundaries", ["index.test.ts"], {
    assumeInstalled: ["sass"],
  }),
  appDir("not-found/default", "boundaries", ["default.test.ts"]),
  appDir("not-found/group-route", "boundaries", ["index.test.ts"]),
  appDir("not-found/group-route-root-not-found", "boundaries", ["index.test.ts"]),
  appDir("not-found-non-document", "boundaries", ["not-found-non-document.test.ts"]),
  appDir("not-found-non-document-dynamic", "boundaries", [
    "not-found-non-document-dynamic.test.ts",
  ]),
  appDir("not-found-with-layout-and-group-not-found", "boundaries", ["index.test.ts"]),
  appDir("not-found-with-nested-layouts", "boundaries", ["index.test.ts"]),
  appDir("prefetching-not-found", "boundaries", ["prefetching-not-found.test.ts"]),
  appDir("global-not-found/basic", "boundaries", ["global-not-found-basic.test.ts"]),
  appDir("global-not-found/both-present", "boundaries", ["both-present.test.ts"]),
  appDir("global-not-found/cache-components", "boundaries", ["cache-components.test.ts"]),
  appDir("global-not-found/css", "boundaries", ["global-not-found-css.test.ts"]),
  appDir("global-not-found/metadata", "boundaries", ["metadata.test.ts"]),
  appDir("global-not-found/no-root-layout", "boundaries", ["no-root-layout.test.ts"]),
  appDir("global-not-found/not-present", "boundaries", ["not-present.test.ts"]),
  appDir("error-boundary-navigation", "boundaries", ["index.test.ts"]),
  appDir("global-error/basic", "boundaries", ["index.test.ts"]),
  appDir("errors", "boundaries", ["index.test.ts"]),
  appDir("forbidden/basic", "boundaries", ["forbidden-basic.test.ts"]),
  appDir("forbidden/default", "boundaries", ["forbidden-default.test.ts"]),
  appDir("unauthorized/basic", "boundaries", ["unauthorized-basic.test.ts"]),
  appDir("unauthorized/default", "boundaries", ["unauthorized-default.test.ts"]),

  appDir("metadata", "metadata", ["metadata.test.ts"]),
  appDir("metadata-navigation", "metadata", ["metadata-navigation.test.ts"]),
  // The metadata files: images, generated or not, `sitemap`, `robots` and
  // `manifest`, their routes and what a page links of them. Not
  // `metadata-invalid-image-file`, whose test expects `next build` to fail:
  // the run stops when it starts, with Next's error. `@vercel/og` is what
  // Next's compiler aliases to `next/og`.
  appDir("metadata-dynamic-routes", "metadata", ["index.test.ts"], {
    assumeInstalled: ["@vercel/og"],
  }),
  appDir("metadata-dynamic-routes-async-deps", "metadata", ["index.test.ts"], {
    assumeInstalled: ["@vercel/og"],
  }),
  appDir("metadata-font", "metadata", ["metadata-font.test.ts"]),
  appDir("metadata-icons-parallel-routes", "metadata", ["metadata-icons-parallel-routes.test.ts"]),
  appDir("metadata-image-files", "metadata", ["metadata-image-files.test.ts"]),
  appDir("metadata-json-manifest", "metadata", ["index.test.ts"]),
  appDir("metadata-non-standard-custom-routes", "metadata", [
    "metadata-non-standard-custom-routes.test.ts",
  ]),
  appDir("metadata-route-like-pages", "metadata", ["metadata-route-like-pages.test.ts"]),
  appDir("metadata-static-file", "metadata", [
    "metadata-static-file-dynamic-route.test.ts",
    "metadata-static-file-group-route.test.ts",
    "metadata-static-file-intercepting-route.test.ts",
    "metadata-static-file-parallel-route.test.ts",
    "metadata-static-file-root-route.test.ts",
    "metadata-static-file-static-route.test.ts",
  ]),
  appDir("metadata-svg-icon", "metadata", ["metadata-svg-icon.test.ts"]),
  appDir("sitemap-group", "metadata", ["sitemap-group.test.ts"]),

  // `@next/font` is the old name of `next/font`. The app imports `next/font`.
  appDir("next-font", "font", ["next-font.test.ts"], { assumeInstalled: ["@next/font"] }),
  appDir("mdx-font-preload", "font", ["mdx-font-preload.test.ts"]),
  appDir("next-image", "image", ["next-image.test.ts"]),

  // Next's own tests of CSS, with the packages their tests install: Sass,
  // Lightning CSS, Tailwind, `postcss-nested` and `@next/mdx`. Of `scss`, a
  // directory of 40 apps of their own, only `scss-mixins` has an `app/`: the
  // others are apps of the Pages Router. Not here either:
  // - `css-order`, it builds its app with `nextTestSetup({ files })`, which the runner does not.
  // - `turbopack-postcss-multiple-configs` and `css-modules-data-urls`, which only Turbopack runs.
  appDir("app-css", "css", ["index.test.ts"]),
  appDir("app-css-pageextensions", "css", ["index.test.ts"]),
  appDir("app-inline-css", "css", ["index.test.ts"]),
  appDir("autoscroll-with-css-modules", "css", ["index.test.ts"]),
  appDir("css-bom", "css", ["css-bom.test.ts"]),
  appDir("css-chunking", "css", ["css-chunking.test.ts"]),
  appDir("css-client-side-nav-parallel-routes", "css", [
    "css-client-side-nav-parallel-routes.test.ts",
  ]),
  appDir("css-media-query", "css", ["css-media-query.test.ts"]),
  appDir("css-modules-pure-no-check", "css", ["css-modules-pure-no-check.test.ts"]),
  appDir("css-modules-rsc-postcss", "css", ["css-modules-rsc-postcss.test.ts"]),
  appDir("css-modules-scoping", "css", ["css-modules-scoping.test.ts"]),
  appDir("css-server-chunks", "css", ["css-server-chunks.test.ts"]),
  appDir("cssnano-colormin", "css", ["index.test.ts"]),
  appDir("dynamic-css", "css", ["index.test.ts"]),
  appDir("experimental-lightningcss-features", "css", [
    "experimental-lightningcss-features.test.ts",
  ]),
  appDir("initial-css-not-found", "css", ["initial-css-not-found.test.ts"]),
  appDir("initial-css-order", "css", ["initial-css-order.test.ts"]),
  appDir("next-dynamic-css", "css", ["next-dynamic-css.test.ts"]),
  // The runner has Tailwind 3 as `tailwindcss`, for `tailwind-css`.
  appDir("no-double-tailwind-execution", "css", ["no-double-tailwind-execution.test.ts"], {
    linked: { tailwindcss: "tailwindcss-4" },
  }),
  appDir("parallel-routes-css", "css", ["parallel-routes-css.test.ts"]),
  appDir("random-in-sass", "css", ["random-in-sass.test.ts"]),
  appDir("scss/scss-mixins", "css", ["scss-mixins.test.ts"]),
  appDir("tailwind-css", "css", ["tailwind-css.test.ts"]),

  appDir("revalidate-dynamic", "cache", ["revalidate-dynamic.test.ts"]),
  appDir("revalidatetag-rsc", "cache", ["revalidatetag-rsc.test.ts"]),
  appDir("unstable-rethrow", "cache", ["unstable-rethrow.test.ts"]),

  appDir("app-middleware", "routing", ["app-middleware.test.ts"]),
  appDir("rewrites-redirects", "routing", ["rewrites-redirects.test.ts"], {
    assumeInstalled: ["@types/react"],
  }),
  // The test builds without the page that needs `cacheComponents`, with
  // `--debug-build-paths`.
  appDir("trailingslash", "routing", ["trailingslash.test.ts"], {
    prepared: { options: ["buildArgs"], remove: ["app/[lang]/cache-components"] },
  }),
  appDir("app-routes-trailing-slash", "routing", ["app-routes-trailing-slash.test.ts"]),
  appDir("redirect-rewrite-dynamic", "routing", ["redirect-rewrite-dynamic.test.ts"]),

  // Cookies, headers, draft mode and `after()`. Not here:
  // - `next-after-app-deploy`, which revalidates a page that the build
  //   prerendered, and waits for it to settle: every request renders here.
  // - `next-after-app-static`, `after()` while `next build` prerenders.
  // - `graceful-shutdown-next-after`, which starts and stops `next start`.
  appDir("draft-mode", "request-apis", ["draft-mode.test.ts"]),
  appDir("draft-mode-middleware", "request-apis", ["draft-mode-middleware.test.ts"]),
  appDir("set-cookies", "request-apis", ["set-cookies.test.ts"]),
  appDir("dynamic-requests", "request-apis", ["dynamic-requests.test.ts"]),
  appDir("headers-static-bailout", "request-apis", ["headers-static-bailout.test.ts"]),
  appDir("x-forwarded-headers", "request-apis", ["x-forwarded-headers.test.ts"]),
  appDir("server-action-headers-redirect", "request-apis", [
    "server-action-headers-redirect.test.ts",
  ]),
  appDir("custom-cache-control", "request-apis", ["custom-cache-control.test.ts"]),
  appDir("react-max-headers-length", "request-apis", ["react-max-headers-length.test.ts"]),
  appDir("next-after-app", "request-apis", ["index.test.ts"]),
  // The test builds and starts the app itself, with `next.build()` and
  // `next.start()`.
  appDir("next-after-app-api-usage", "request-apis", ["index.test.ts"], {
    prepared: { options: ["skipStart"] },
  }),
  appDir("revalidate-tag-in-after", "request-apis", ["revalidate-tag-in-after.test.ts"]),

  // Most of Next's tests of Partial Prerendering and the segment cache are of
  // what `next build` prerendered, or of the prefetches of Next's router,
  // which they intercept with Playwright. These are the ones that are not.
  // Not here:
  // - `ppr`, `ppr-full`, `ppr-metadata-blocking`, `ppr-navigations/prefetch-navigation`,
  //   `ppr-navigations/search-params` and `ppr-middleware-rewrite-force-dynamic-ssg-dynamic-params`,
  //   which skip all of their tests in a run like this one.
  // - `ppr-partial-hydration`, which changes the app, or reads the page before it hydrated.
  // - `ppr-missing-root-params`, which expects `next build` to fail.
  // - `ppr-unstable-cache`, `ppr-navigations/avoid-popstate-flash` and
  //   `ppr-navigations/stale-prefetch-entry`, which start a server of their own in Node.js.
  // - The other fixtures of `segment-cache`, and `segment-cache-closed-params` and
  //   `segment-cache-dynamic-params`, which intercept the requests of the router with
  //   `createRouterAct()`: that needs Playwright's `page.route()`.
  appDir("ppr-root-param-fallback", "ppr", ["ppr-root-param-fallback.test.ts"]),
  appDir("ppr-root-param-rsc-fallback", "ppr", ["ppr-root-param-rsc-fallback.test.ts"]),
  appDir("ppr-history-replace-state", "ppr", ["ppr-history-replace-state.test.ts"]),
  appDir("segment-cache/no-prefetch", "ppr", ["no-prefetch.test.ts"]),
  appDir("segment-cache/mpa-navigations", "ppr", ["mpa-navigations.test.ts"]),
  appDir("segment-cache/prefetch-partial-rsc", "ppr", ["prefetch-partial-rsc.test.ts"]),
  appDir("segment-cache/stale-search-params-on-replace-regression", "ppr", [
    "stale-search-params-on-replace-regression.test.ts",
  ]),

  // The test pins the version of Babel, which Next's compiler uses, not the app.
  appDir("rsc-basic", "basics", ["rsc-basic.test.ts"], {
    assumeInstalled: ["@babel/core", "@babel/parser", "@babel/types", "@babel/traverse"],
  }),
  appDir("use-server-inserted-html", "basics", ["use-server-inserted-html.test.ts"]),
  // `dynamic-data` has three apps in `fixtures/`, one for each `describe` of
  // its test file. Each is a fixture here.
  ...["main", "require-static", "cache-scoped"].map((app) =>
    appDir("dynamic-data", "request-apis", ["dynamic-data.test.ts"], {
      id: `dynamic-data__${app}`,
      app: `fixtures/${app}`,
    }),
  ),
  // The tests of the client cache with the defaults of `staleTimes`. Not
  // `client-cache.original.test.ts` and `client-cache.experimental.test.ts`,
  // which give each `describe` a `staleTimes` of its own, and not
  // `client-cache.parallel-routes.test.ts`, which Next skips itself.
  appDir("app-client-cache", "navigation", ["client-cache.defaults.test.ts"], {
    id: "app-client-cache__regular",
    app: "fixtures/regular",
  }),
];
