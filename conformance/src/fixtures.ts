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
  "use-cache": '`"use cache"` and Cache Components',
  routing: "The proxy, rewrites, redirects, trailingSlash",
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

  // Next's tests of `"use cache"` and Cache Components. Not
  // `use-cache.partial-prefetching.test.ts`, which runs the tests of
  // `use-cache` again with partial prefetching. These are not here either:
  // - In `start` mode, the tests of these run `next build` themselves, to
  //   read the error it fails with or the route it prerenders:
  //   `use-cache-close-over-function`, `use-cache-configured-timeout`,
  //   `use-cache-hanging`, `use-cache-hanging-inputs`,
  //   `use-cache-og-image-top-level-await`, `use-cache-output-export`,
  //   `use-cache-search-params`, `use-cache-segment-configs`,
  //   `use-cache-unknown-cache-kind`, `use-cache-without-experimental-flag`,
  //   `cache-components-create-component-tree` and
  //   `cache-components-route-handler-errors`.
  // - These build an app of their own for each test, out of a directory of
  //   `fixtures/`, and most of their tests read what `next build` prints:
  //   `cache-components-console`, `cache-components-dynamic-imports`,
  //   `cache-components-errors`, `cache-components-request-apis` and
  //   `cache-components-segment-configs`.
  // - `cache-components-allow-otel-spans`, its app needs OpenTelemetry's packages.
  // - `use-cache-after-uncached-io`, its test imports `router-act` of Next's
  //   test library, which watches the requests of Next's router with
  //   Playwright's `page.route()`.
  appDir("cache-components", "use-cache", [
    "cache-components.test.ts",
    "cache-components.connection.test.ts",
    "cache-components.cookies.test.ts",
    "cache-components.date.test.ts",
    "cache-components.draft-mode.test.ts",
    "cache-components.headers.test.ts",
    "cache-components.node-crypto.test.ts",
    "cache-components.params.test.ts",
    "cache-components.random.test.ts",
    "cache-components.routes.test.ts",
    "cache-components.search.test.ts",
    "cache-components.server-action.test.ts",
    "cache-components.web-crypto.test.ts",
  ]),
  appDir("cache-components-bot-ua", "use-cache", ["cache-components-bot-ua.test.ts"]),
  appDir("cache-components-prerender-matrix", "use-cache", [
    "cache-components-prerender-matrix.test.ts",
  ]),
  appDir("use-cache", "use-cache", ["use-cache.test.ts"]),
  appDir("use-cache-custom-handler", "use-cache", ["use-cache-custom-handler.test.ts"]),
  appDir("use-cache-default-handler-expire-zero", "use-cache", [
    "use-cache-default-handler-expire-zero.test.ts",
  ]),
  appDir("use-cache-default-profile-expire-zero", "use-cache", [
    "use-cache-default-profile-expire-zero.test.ts",
  ]),
  appDir("use-cache-draft-mode-isolation", "use-cache", ["use-cache-draft-mode-isolation.test.ts"]),
  appDir("use-cache-fallback-root-params", "use-cache", ["use-cache-fallback-root-params.test.ts"]),
  appDir("use-cache-infinity-profile", "use-cache", ["use-cache-infinity-profile.test.ts"]),
  appDir("use-cache-metadata-route-handler", "use-cache", [
    "use-cache-metadata-route-handler.test.ts",
  ]),
  appDir("use-cache-private", "use-cache", ["use-cache-private.test.ts"]),
  appDir("use-cache-root-param-metadata", "use-cache", ["use-cache-root-param-metadata.test.ts"]),
  appDir("use-cache-route-handler-only", "use-cache", ["use-cache-route-handler-only.test.ts"]),
  appDir("use-cache-swr", "use-cache", ["use-cache-swr.test.ts"]),
  appDir("use-cache-with-server-function-props", "use-cache", [
    "use-cache-with-server-function-props.test.ts",
  ]),

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
];
