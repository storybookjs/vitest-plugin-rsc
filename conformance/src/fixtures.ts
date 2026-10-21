// The fixtures of Next's own e2e tests that the runner runs: a directory of
// `vercel/next.js` with an app and the test files that open it.

export type Fixture = {
  /** Also the name of the copy that the tests run in. */
  id: string;
  /** The directory of the app, in Next's repository. */
  dir: string;
  /** The test files to run, relative to `dir`. */
  tests: string[];
  /** What the fixture is here for. */
  area: Area;
  /** Packages its test lists as dependencies that its app does not import. */
  assumeInstalled?: string[];
  /**
   * Options of `nextTestSetup()` that change the app before Next builds it,
   * and what the runner does to the copy of the fixture instead. Without it,
   * a test that passes such an option is reported as not applicable.
   */
  prepared?: { options: string[]; remove?: string[] };
};

export const areas = {
  basics: "Pages and rendering",
  navigation: "Navigation",
  actions: "Server Actions",
  "route-handlers": "Route handlers",
  "parallel-routes": "Parallel routes",
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

  appDir("not-found-default", "boundaries", ["index.test.ts"]),
  appDir("error-boundary-navigation", "boundaries", ["index.test.ts"]),
  appDir("global-error/basic", "boundaries", ["index.test.ts"]),
  appDir("errors", "boundaries", ["index.test.ts"]),
  appDir("forbidden/basic", "boundaries", ["forbidden-basic.test.ts"]),
  appDir("forbidden/default", "boundaries", ["forbidden-default.test.ts"]),
  appDir("unauthorized/basic", "boundaries", ["unauthorized-basic.test.ts"]),
  appDir("unauthorized/default", "boundaries", ["unauthorized-default.test.ts"]),

  appDir("metadata", "metadata", ["metadata.test.ts"]),
  appDir("metadata-navigation", "metadata", ["metadata-navigation.test.ts"]),

  // `@next/font` is the old name of `next/font`. The app imports `next/font`.
  appDir("next-font", "font", ["next-font.test.ts"], { assumeInstalled: ["@next/font"] }),
  appDir("next-image", "image", ["next-image.test.ts"]),

  // Next's own tests of CSS. Not `scss`, a directory of 40 apps of their own,
  // for Sass. A fixture whose app needs a package the runner does not install
  // stops before its tests run, so these are not here either:
  // - `app-css`, its config needs `@next/mdx`.
  // - `css-modules-rsc-postcss`, its PostCSS config needs `postcss-nested`.
  // - `tailwind-css`, its PostCSS config needs Tailwind 3.
  // - `no-double-tailwind-execution`, its PostCSS config needs Tailwind 4.
  // - `css-order`, it builds its app with `nextTestSetup({ files })`, which the runner does not.
  // - `turbopack-postcss-multiple-configs` and `css-modules-data-urls`, which only Turbopack runs.
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
  appDir("parallel-routes-css", "css", ["parallel-routes-css.test.ts"]),
  appDir("random-in-sass", "css", ["random-in-sass.test.ts"]),

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
  // Not `app-client-cache` and `dynamic-data`: their apps are in directories
  // of the fixture, like `fixtures/regular`, next to the test files, and the
  // runner runs a test file in the directory of its app.
];
