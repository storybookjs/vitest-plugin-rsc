# Next.js Conformance

`conformance/` runs a selection of Next's own e2e tests against `vitest-plugin-rsc/nextjs`: the ones in `test/e2e/app-dir` of [`vercel/next.js`](https://github.com/vercel/next.js). Each of them is an app with tests of how Next runs it. So the share that passes says how close the plugin is to Next, and the rest is a list of what is different, each test with why.

It is not a part of `pnpm test`. It fetches from GitHub, and a run takes minutes.

## Results

<!-- conformance:results:start -->

Measured against `next@16.4.0`, with `pnpm conformance --docs`.

|                                                     |         Tests |
| --------------------------------------------------- | ------------: |
| Run                                                 |          1311 |
| **Pass**                                            | **956** (73%) |
| Fail: a bug in the plugin                           |             0 |
| Fail: Not Yet                                       |           191 |
| Fail: not applicable                                |           164 |
| Skipped by the test itself, for a run like this one |            16 |

Of the 1147 tests that apply, 956 pass: **83%**.

### Per Fixture

| Fixture                                                   |     Pass | Bug | Not Yet | N/A | Skipped |
| --------------------------------------------------------- | -------: | --: | ------: | --: | ------: |
| **Pages and rendering**                                   |          |     |         |     |         |
| `hello-world`                                             |   4 of 4 |     |         |     |         |
| `rsc-basic`                                               | 36 of 40 |     |       3 |   1 |       1 |
| `use-server-inserted-html`                                |   3 of 3 |     |         |     |         |
| **Navigation**                                            |          |     |         |     |         |
| `navigation`                                              | 42 of 53 |     |       7 |   4 |         |
| `shallow-routing`                                         | 17 of 17 |     |         |     |         |
| `hooks`                                                   | 19 of 27 |     |       8 |     |         |
| `use-params`                                              |   6 of 7 |     |       1 |     |         |
| `navigation-focus`                                        |   5 of 5 |     |         |     |         |
| `navigation-layout-suspense`                              |   1 of 1 |     |         |     |         |
| `navigation-redirect-import`                              |   1 of 1 |     |         |     |         |
| `navigation-with-queued-actions`                          |   1 of 1 |     |         |     |         |
| `router-autoscroll`                                       | 20 of 20 |     |         |     |       1 |
| `root-layout`                                             |   7 of 8 |     |       1 |     |         |
| `root-layout-redirect`                                    |   1 of 1 |     |         |     |         |
| `root-layout-render-once`                                 |   1 of 1 |     |         |     |         |
| `app-edge-root-layout`                                    |   1 of 2 |     |         |   1 |         |
| `concurrent-navigations`                                  |   1 of 2 |     |         |   1 |         |
| `layout-params`                                           |   6 of 6 |     |         |     |         |
| `use-selected-layout-segment-s`                           |   8 of 8 |     |         |     |         |
| `dynamic-href`                                            |   2 of 2 |     |         |     |         |
| `rsc-redirect`                                            |   2 of 2 |     |         |     |         |
| `search-params-react-key`                                 |   1 of 1 |     |         |     |         |
| `searchparams-reuse-loading`                              |  5 of 12 |     |       2 |   5 |         |
| `searchparams-static-bailout`                             |   3 of 5 |     |       2 |     |         |
| `multi-value-search-params-stale`                         |   1 of 1 |     |         |     |         |
| `rewrite-with-search-params`                              |   0 of 1 |     |         |   1 |         |
| `app-client-cache/fixtures/regular`                       | 10 of 10 |     |         |     |         |
| **Server Actions**                                        |          |     |         |     |         |
| `actions`                                                 | 64 of 87 |     |       3 |  20 |       3 |
| `actions-navigation`                                      |   2 of 2 |     |         |     |         |
| `actions-revalidate-remount`                              |   1 of 1 |     |         |     |         |
| `actions-unrecognized`                                    | 18 of 20 |     |         |   2 |         |
| `server-actions-relative-redirect`                        |   5 of 5 |     |         |     |         |
| **Route handlers**                                        |          |     |         |     |         |
| `app-simple-routes`                                       |   2 of 2 |     |         |     |         |
| `app-routes`                                              | 59 of 67 |     |         |   8 |       1 |
| **Parallel routes**                                       |          |     |         |     |         |
| `parallel-routes-layouts`                                 |   1 of 1 |     |         |     |         |
| `parallel-routes-catchall`                                |   4 of 4 |     |         |     |         |
| `parallel-routes-breadcrumbs`                             |   4 of 4 |     |         |     |         |
| `parallel-routes-not-found`                               |   2 of 2 |     |         |     |         |
| **Interception routes**                                   |          |     |         |     |         |
| `interception-dynamic-segment`                            |  4 of 19 |     |         |  15 |         |
| `interception-dynamic-segment-middleware`                 |   4 of 4 |     |         |     |         |
| `interception-dynamic-single-segment`                     |   9 of 9 |     |         |     |         |
| `interception-middleware-rewrite`                         |   3 of 3 |     |         |     |         |
| `interception-route-prefetch-cache`                       |   1 of 2 |     |         |   1 |         |
| `interception-routes-multiple-catchall`                   |   5 of 5 |     |         |     |         |
| `interception-routes-root-catchall`                       |   2 of 2 |     |         |     |         |
| `interception-segments-two-levels-above`                  |   3 of 3 |     |         |     |         |
| `dynamic-interception-route-revalidate`                   |   1 of 1 |     |         |     |         |
| `parallel-routes-and-interception`                        | 26 of 55 |     |         |  29 |         |
| `parallel-routes-and-interception-basepath`               |   2 of 2 |     |         |     |         |
| `parallel-routes-and-interception-catchall`               |   1 of 1 |     |         |     |         |
| `parallel-routes-and-interception-from-root`              |   1 of 2 |     |         |   1 |         |
| `parallel-routes-and-interception-nested-dynamic-routes`  |   1 of 1 |     |         |     |         |
| **not-found and error boundaries**                        |          |     |         |     |         |
| `not-found-default`                                       |   7 of 7 |     |         |     |         |
| `not-found/basic`                                         |  7 of 14 |     |         |   7 |         |
| `not-found/conflict-route`                                |   2 of 4 |     |         |   2 |         |
| `not-found/css-precedence`                                |   1 of 1 |     |         |     |         |
| `not-found/default`                                       |   1 of 2 |     |         |   1 |         |
| `not-found/group-route`                                   |   1 of 2 |     |         |   1 |         |
| `not-found/group-route-root-not-found`                    |   2 of 2 |     |         |     |         |
| `not-found-non-document`                                  |   6 of 6 |     |         |     |         |
| `not-found-non-document-dynamic`                          |   4 of 4 |     |         |     |         |
| `not-found-with-layout-and-group-not-found`               |   1 of 1 |     |         |     |         |
| `not-found-with-nested-layouts`                           |   1 of 1 |     |         |     |         |
| `prefetching-not-found`                                   |   1 of 1 |     |         |     |         |
| `global-not-found/basic`                                  |   3 of 3 |     |         |     |         |
| `global-not-found/both-present`                           |   2 of 2 |     |         |     |         |
| `global-not-found/cache-components`                       |   2 of 2 |     |         |     |         |
| `global-not-found/css`                                    |   1 of 1 |     |         |     |         |
| `global-not-found/metadata`                               |   1 of 1 |     |         |     |         |
| `global-not-found/no-root-layout`                         |   2 of 2 |     |         |     |         |
| `global-not-found/not-present`                            |   2 of 2 |     |         |     |         |
| `error-boundary-navigation`                               |   7 of 7 |     |         |     |         |
| `global-error/basic`                                      | 10 of 10 |     |         |     |         |
| `errors`                                                  | 13 of 16 |     |         |   3 |         |
| `forbidden/basic`                                         |   2 of 2 |     |         |     |         |
| `forbidden/default`                                       |   3 of 3 |     |         |     |       2 |
| `unauthorized/basic`                                      |   2 of 2 |     |         |     |         |
| `unauthorized/default`                                    |   3 of 3 |     |         |     |       2 |
| **Metadata**                                              |          |     |         |     |         |
| `metadata`                                                | 44 of 49 |     |       2 |   3 |         |
| `metadata-navigation`                                     |   7 of 7 |     |         |     |         |
| `metadata-dynamic-routes`                                 | 15 of 27 |     |       6 |   6 |         |
| `metadata-dynamic-routes-async-deps`                      |   1 of 2 |     |       1 |     |         |
| `metadata-font`                                           |   0 of 1 |     |       1 |     |         |
| `metadata-icons-parallel-routes`                          |   5 of 5 |     |         |     |         |
| `metadata-image-files`                                    |   1 of 1 |     |         |     |         |
| `metadata-json-manifest`                                  |   1 of 1 |     |         |     |         |
| `metadata-non-standard-custom-routes`                     |   1 of 1 |     |         |     |         |
| `metadata-route-like-pages`                               |   2 of 2 |     |         |     |         |
| `metadata-static-file`                                    |  6 of 13 |     |         |   7 |         |
| `metadata-svg-icon`                                       |   1 of 1 |     |         |     |         |
| `sitemap-group`                                           |   2 of 2 |     |         |     |         |
| **next/font**                                             |          |     |         |     |         |
| `next-font`                                               | 12 of 16 |     |       4 |     |         |
| `mdx-font-preload`                                        |   3 of 3 |     |         |     |         |
| **next/image**                                            |          |     |         |     |         |
| `next-image`                                              | 10 of 11 |     |         |   1 |         |
| **CSS**                                                   |          |     |         |     |         |
| `app-css`                                                 | 32 of 35 |     |       3 |     |       1 |
| `app-css-pageextensions`                                  |   1 of 1 |     |         |     |         |
| `app-inline-css`                                          |   6 of 6 |     |         |     |         |
| `autoscroll-with-css-modules`                             |   2 of 2 |     |         |     |         |
| `css-bom`                                                 |   1 of 2 |     |         |   1 |         |
| `css-chunking`                                            |   1 of 1 |     |         |     |         |
| `css-client-side-nav-parallel-routes`                     |   1 of 1 |     |         |     |         |
| `css-media-query`                                         |   2 of 2 |     |         |     |         |
| `css-modules-pure-no-check`                               |   1 of 2 |     |       1 |     |         |
| `css-modules-rsc-postcss`                                 |   1 of 1 |     |         |     |         |
| `css-modules-scoping`                                     |   2 of 2 |     |         |     |         |
| `css-server-chunks`                                       |   0 of 1 |     |       1 |     |         |
| `cssnano-colormin`                                        |   1 of 1 |     |         |     |         |
| `dynamic-css`                                             |   4 of 5 |     |       1 |     |         |
| `experimental-lightningcss-features`                      |   0 of 3 |     |         |   3 |         |
| `initial-css-not-found`                                   |   1 of 1 |     |         |     |         |
| `initial-css-order`                                       |   2 of 2 |     |         |     |         |
| `next-dynamic-css`                                        |   4 of 4 |     |         |     |         |
| `no-double-tailwind-execution`                            |   0 of 1 |     |         |   1 |         |
| `parallel-routes-css`                                     |   1 of 1 |     |         |     |         |
| `random-in-sass`                                          |   1 of 1 |     |         |     |         |
| `scss/scss-mixins`                                        |   1 of 1 |     |         |     |         |
| `tailwind-css`                                            |   1 of 1 |     |         |     |         |
| **The Data Cache**                                        |          |     |         |     |         |
| `revalidate-dynamic`                                      |   2 of 3 |     |         |   1 |         |
| `revalidatetag-rsc`                                       |   3 of 3 |     |         |     |         |
| `unstable-rethrow`                                        |   3 of 4 |     |         |   1 |         |
| **`"use cache"` and Cache Components**                    |          |     |         |     |         |
| `cache-components`                                        | 16 of 75 |     |      58 |   1 |       5 |
| `cache-components-bot-ua`                                 |   1 of 1 |     |         |     |         |
| `cache-components-prerender-matrix`                       | 23 of 60 |     |      37 |     |         |
| `use-cache`                                               | 42 of 59 |     |       9 |   8 |         |
| `use-cache-custom-handler`                                |  9 of 11 |     |       1 |   1 |         |
| `use-cache-default-handler-expire-zero`                   |   1 of 1 |     |         |     |         |
| `use-cache-default-profile-expire-zero`                   |   2 of 2 |     |         |     |         |
| `use-cache-draft-mode-isolation`                          |   5 of 5 |     |         |     |         |
| `use-cache-fallback-root-params`                          |   1 of 5 |     |         |   4 |         |
| `use-cache-infinity-profile`                              |   1 of 2 |     |         |   1 |         |
| `use-cache-metadata-route-handler`                        |  0 of 12 |     |      10 |   2 |         |
| `use-cache-private`                                       |   9 of 9 |     |         |     |         |
| `use-cache-root-param-metadata`                           |   1 of 2 |     |         |   1 |         |
| `use-cache-route-handler-only`                            |   3 of 5 |     |       1 |   1 |         |
| `use-cache-swr`                                           |   5 of 7 |     |       2 |     |         |
| `use-cache-with-server-function-props`                    |   1 of 2 |     |       1 |     |         |
| **The proxy, rewrites, redirects, trailingSlash**         |          |     |         |     |         |
| `app-middleware`                                          | 15 of 22 |     |       6 |   1 |         |
| `rewrites-redirects`                                      | 14 of 14 |     |         |     |         |
| `trailingslash`                                           |   6 of 8 |     |       2 |     |         |
| `app-routes-trailing-slash`                               |   2 of 2 |     |         |     |         |
| `redirect-rewrite-dynamic`                                |   1 of 2 |     |         |   1 |         |
| **Cookies, headers, draft mode and after()**              |          |     |         |     |         |
| `draft-mode`                                              | 20 of 21 |     |       1 |     |         |
| `draft-mode-middleware`                                   |   1 of 2 |     |       1 |     |         |
| `set-cookies`                                             |   2 of 5 |     |       3 |     |         |
| `dynamic-requests`                                        |   2 of 2 |     |         |     |         |
| `headers-static-bailout`                                  |   1 of 3 |     |       1 |   1 |         |
| `x-forwarded-headers`                                     |   2 of 4 |     |         |   2 |         |
| `server-action-headers-redirect`                          |   1 of 1 |     |         |     |         |
| `custom-cache-control`                                    |   7 of 9 |     |       2 |     |         |
| `react-max-headers-length`                                |   1 of 4 |     |         |   3 |         |
| `next-after-app`                                          | 26 of 34 |     |         |   8 |         |
| `next-after-app-api-usage`                                | 22 of 28 |     |       6 |     |         |
| `revalidate-tag-in-after`                                 |   1 of 1 |     |         |     |         |
| `dynamic-data/fixtures/main`                              |   3 of 5 |     |       2 |     |         |
| `dynamic-data/fixtures/require-static`                    |   0 of 1 |     |         |   1 |         |
| `dynamic-data/fixtures/cache-scoped`                      |   0 of 1 |     |         |   1 |         |
| **Partial Prerendering and the segment cache**            |          |     |         |     |         |
| `ppr-root-param-fallback`                                 |   0 of 1 |     |       1 |     |         |
| `ppr-root-param-rsc-fallback`                             |   2 of 2 |     |         |     |         |
| `ppr-history-replace-state`                               |   1 of 1 |     |         |     |         |
| `segment-cache/no-prefetch`                               |   1 of 1 |     |         |     |         |
| `segment-cache/mpa-navigations`                           |   2 of 2 |     |         |     |         |
| `segment-cache/prefetch-partial-rsc`                      |   1 of 1 |     |         |     |         |
| `segment-cache/stale-search-params-on-replace-regression` |   1 of 1 |     |         |     |         |

### Not Yet: 191 Tests

<details><summary>118 × A page that a build prerenders, like one with `generateStaticParams`. Next keeps it between two requests, and here every request renders its page.</summary>

- `searchparams-static-bailout`: searchparams-static-bailout › server component › should not bailout when not using searchParams
- `searchparams-static-bailout`: searchparams-static-bailout › client component › should not bailout when not using searchParams
- `metadata`: app dir - metadata › react cache › should have same title and page value when navigating
- `cache-components`: cache-components › should partially prerender pages that use connection
- `cache-components`: cache-components › should be able to pass connection as a promise to another component and trigger an intermediate Suspense boundary
- `cache-components`: cache-components › should partially prerender pages that use cookies
- `cache-components`: cache-components › should be able to pass cookies as a promise to another component and trigger an intermediate Suspense boundary
- `cache-components`: cache-components › should prerender pages with cached `Date.now()` calls
- `cache-components`: cache-components › should prerender pages with cached `Date()` calls
- `cache-components`: cache-components › should prerender pages with cached `new Date()` calls
- `cache-components`: cache-components › should prerender pages with cached static Date instances like `new Date(0)`
- `cache-components`: cache-components › should not prerender pages with uncached static Date instances like `new Date(0)`
- `cache-components`: cache-components › should fully prerender pages that use draftMode
- `cache-components`: cache-components › should partially prerender pages that use headers
- `cache-components`: cache-components › should be able to pass headers as a promise to another component and trigger an intermediate Suspense boundary
- `cache-components`: cache-components › should prerender pages with cached `require('node:crypto').getRandomValues(...)` calls
- `cache-components`: cache-components › should prerender pages with cached `require('node:crypto').randomUUID()` calls
- `cache-components`: cache-components › should prerender pages with cached `require('node:crypto').randomBytes(size)` calls
- `cache-components`: cache-components › should prerender pages with cached `require('node:crypto').randomFillSync(buffer)` calls
- `cache-components`: cache-components › should prerender pages with cached `require('node:crypto').randomInt(max)` calls
- `cache-components`: cache-components › should prerender pages with cached `require('node:crypto').randomInt(min, max)` calls
- `cache-components`: cache-components › should prerender pages with cached `require('node:crypto').generatePrimeSync(size, options)` calls
- `cache-components`: cache-components › should prerender pages with cached `require('node:crypto').generateKeyPairSync(type, options)` calls
- `cache-components`: cache-components › should prerender pages with cached `require('node:crypto').generateKeySync(type, options)` calls
- `cache-components`: cache-components › Params › should partially prerender pages that await params in a server components
- `cache-components`: cache-components › Params › should fully prerender pages that check individual param keys after awaiting params in a server component
- `cache-components`: cache-components › Params › should partially prerender pages that spread awaited params in a server component
- `cache-components`: cache-components › Param Shadowing › should correctly allow param names like then, value, and status when awaiting params in a server component
- `cache-components`: cache-components › should prerender pages with cached Math.random() calls
- `cache-components`: cache-components › should prerender GET route handlers that have entirely cached io (fetches)
- `cache-components`: cache-components › should prerender GET route handlers that have entirely cached io (unstable_cache)
- `cache-components`: cache-components › should prerender GET route handlers that have entirely cached io ("use cache")
- `cache-components`: cache-components › should prerender GET route handlers that complete synchronously or in a microtask
- `cache-components`: cache-components › should prerender GET route handlers when accessing params
- `cache-components`: cache-components › should partially prerender pages that await searchParams in a server component
- `cache-components`: cache-components › should partially prerender pages that `use` searchParams in a server component
- `cache-components`: cache-components › should partially prerender pages that `use` searchParams in a client component
- `cache-components`: cache-components › should prerender pages with inline server actions
- `cache-components`: cache-components › should prerender fully static pages
- `cache-components`: cache-components › should prerender static not-found pages
- `cache-components`: cache-components › should prerender pages that render in a microtask
- `cache-components`: cache-components › should partially prerender pages that take longer than a task to render
- `cache-components`: cache-components › should prerender pages that only use cached fetches
- `cache-components`: cache-components › should partially prerender pages that use at least one fetch without cache
- `cache-components`: cache-components › should prerender pages that only use cached (unstable_cache) IO
- `cache-components`: cache-components › should prerender pages that only use cached ("use cache") IO
- `cache-components`: cache-components › should prerender pages that cached the whole page
- `cache-components`: cache-components › should partially prerender pages that do any uncached IO
- `cache-components`: cache-components › should partially prerender pages that do any uncached IO (use cache)
- `cache-components`: cache-components › should partially prerender pages that use `cookies()`
- `cache-components`: cache-components › should partially prerender pages that use `headers()`
- `cache-components`: cache-components › should fully prerender pages that use `unstable_noStore()`
- `cache-components`: cache-components › should partially prerender pages that use `searchParams` in Server Components
- `cache-components`: cache-components › should partially prerender pages that use `searchParams` in Client Components
- `cache-components`: cache-components › can prerender pages with parallel routes that are static
- `cache-components`: cache-components › can prerender pages with parallel routes that resolve in a microtask
- `cache-components`: cache-components › does not prerender pages with parallel routes that resolve in a task
- `cache-components`: cache-components › does not prerender pages with parallel routes that uses a dynamic API
- `cache-components`: cache-components › should not resume when client components are dynamic but the RSC render was static
- `cache-components`: cache-components › should prerender pages with cached `crypto.getRandomValues(...)` calls
- `cache-components`: cache-components › should prerender pages with cached `crypto.randomUUID()` calls
- `cache-components-prerender-matrix`: cache-components-prerender-matrix › partial-static-param/without-root-param/non-empty-shell › serves everything except the [id] region from the cache at lang=fresh category=fresh id=fresh
- `cache-components-prerender-matrix`: cache-components-prerender-matrix › partial-static-param/without-root-param/non-empty-shell › serves everything except the [id] region from the cache at lang=en category=fresh id=fresh
- `cache-components-prerender-matrix`: cache-components-prerender-matrix › partial-static-param/without-root-param/non-empty-shell › serves everything except the [id] region from the cache at lang=en category=shoes id=fresh
- `cache-components-prerender-matrix`: cache-components-prerender-matrix › partial-static-param/without-root-param/non-empty-shell › shares the entry at lang=fresh category=fresh id=fresh with a fresh id value (id excluded from the cache key)
- `cache-components-prerender-matrix`: cache-components-prerender-matrix › partial-static-param/without-root-param/non-empty-shell › shares the entry at lang=en category=fresh id=fresh with a fresh id value (id excluded from the cache key)
- `cache-components-prerender-matrix`: cache-components-prerender-matrix › partial-static-param/without-root-param/non-empty-shell › shares the entry at lang=en category=shoes id=fresh with a fresh id value (id excluded from the cache key)
- `cache-components-prerender-matrix`: cache-components-prerender-matrix › partial-static-param/without-root-param/non-empty-shell › does not share the entry at lang=fresh category=fresh id=fresh across lang values (lang included in the cache key)
- `cache-components-prerender-matrix`: cache-components-prerender-matrix › partial-static-param/without-root-param/non-empty-shell › does not share the entry at lang=fresh category=fresh id=fresh across category values (category included in the cache key)
- `cache-components-prerender-matrix`: cache-components-prerender-matrix › partial-static-param/without-root-param/non-empty-shell › does not share the entry at lang=en category=fresh id=fresh across category values (category included in the cache key)
- `cache-components-prerender-matrix`: cache-components-prerender-matrix › partial-static-param/with-root-param/non-empty-shell › serves everything except the [id] region from the cache at lang=fresh category=fresh id=fresh
- `cache-components-prerender-matrix`: cache-components-prerender-matrix › partial-static-param/with-root-param/non-empty-shell › serves everything except the [id] region from the cache at lang=en category=fresh id=fresh
- `cache-components-prerender-matrix`: cache-components-prerender-matrix › partial-static-param/with-root-param/non-empty-shell › serves everything except the [id] region from the cache at lang=en category=shoes id=fresh
- `cache-components-prerender-matrix`: cache-components-prerender-matrix › partial-static-param/with-root-param/non-empty-shell › shares the entry at lang=fresh category=fresh id=fresh with a fresh id value (id excluded from the cache key)
- `cache-components-prerender-matrix`: cache-components-prerender-matrix › partial-static-param/with-root-param/non-empty-shell › shares the entry at lang=en category=fresh id=fresh with a fresh id value (id excluded from the cache key)
- `cache-components-prerender-matrix`: cache-components-prerender-matrix › partial-static-param/with-root-param/non-empty-shell › shares the entry at lang=en category=shoes id=fresh with a fresh id value (id excluded from the cache key)
- `cache-components-prerender-matrix`: cache-components-prerender-matrix › partial-static-param/with-root-param/non-empty-shell › does not share the entry at lang=fresh category=fresh id=fresh across lang values (lang included in the cache key)
- `cache-components-prerender-matrix`: cache-components-prerender-matrix › partial-static-param/with-root-param/non-empty-shell › does not share the entry at lang=fresh category=fresh id=fresh across category values (category included in the cache key)
- `cache-components-prerender-matrix`: cache-components-prerender-matrix › partial-static-param/with-root-param/non-empty-shell › does not share the entry at lang=en category=fresh id=fresh across category values (category included in the cache key)
- `cache-components-prerender-matrix`: cache-components-prerender-matrix › fully-static-param/without-root-param/empty-shell › serves the whole document from the cache at lang=fresh category=fresh id=fresh
- `cache-components-prerender-matrix`: cache-components-prerender-matrix › fully-static-param/without-root-param/empty-shell › serves the whole document from the cache at lang=en category=fresh id=fresh
- `cache-components-prerender-matrix`: cache-components-prerender-matrix › fully-static-param/without-root-param/empty-shell › serves the whole document from the cache at lang=en category=shoes id=fresh
- `cache-components-prerender-matrix`: cache-components-prerender-matrix › fully-static-param/without-root-param/empty-shell › serves the whole document from the cache at lang=en category=shoes id=1
- `cache-components-prerender-matrix`: cache-components-prerender-matrix › fully-static-param/without-root-param/non-empty-shell › serves the whole document from the cache at lang=fresh category=fresh id=fresh
- `cache-components-prerender-matrix`: cache-components-prerender-matrix › fully-static-param/without-root-param/non-empty-shell › serves the whole document from the cache at lang=en category=fresh id=fresh
- `cache-components-prerender-matrix`: cache-components-prerender-matrix › fully-static-param/without-root-param/non-empty-shell › serves the whole document from the cache at lang=en category=shoes id=fresh
- `cache-components-prerender-matrix`: cache-components-prerender-matrix › fully-static-param/without-root-param/non-empty-shell › serves the whole document from the cache at lang=en category=shoes id=1
- `cache-components-prerender-matrix`: cache-components-prerender-matrix › fully-static-param/with-root-param/empty-shell › serves the whole document from the cache at lang=fresh category=fresh id=fresh
- `cache-components-prerender-matrix`: cache-components-prerender-matrix › fully-static-param/with-root-param/empty-shell › serves the whole document from the cache at lang=en category=fresh id=fresh
- `cache-components-prerender-matrix`: cache-components-prerender-matrix › fully-static-param/with-root-param/empty-shell › serves the whole document from the cache at lang=en category=shoes id=fresh
- `cache-components-prerender-matrix`: cache-components-prerender-matrix › fully-static-param/with-root-param/empty-shell › serves the whole document from the cache at lang=en category=shoes id=1
- `cache-components-prerender-matrix`: cache-components-prerender-matrix › fully-static-param/with-root-param/non-empty-shell › serves the whole document from the cache at lang=fresh category=fresh id=fresh
- `cache-components-prerender-matrix`: cache-components-prerender-matrix › fully-static-param/with-root-param/non-empty-shell › serves the whole document from the cache at lang=en category=fresh id=fresh
- `cache-components-prerender-matrix`: cache-components-prerender-matrix › fully-static-param/with-root-param/non-empty-shell › serves the whole document from the cache at lang=en category=shoes id=fresh
- `cache-components-prerender-matrix`: cache-components-prerender-matrix › fully-static-param/with-root-param/non-empty-shell › serves the whole document from the cache at lang=en category=shoes id=1
- `cache-components-prerender-matrix`: cache-components-prerender-matrix › dynamic-param/without-root-param/non-empty-shell › shares the entry at lang=fresh category=fresh id=fresh with a fresh lang value (lang excluded from the cache key)
- `cache-components-prerender-matrix`: cache-components-prerender-matrix › dynamic-param/without-root-param/non-empty-shell › shares the entry at lang=fresh category=fresh id=fresh with a fresh category value (category excluded from the cache key)
- `cache-components-prerender-matrix`: cache-components-prerender-matrix › dynamic-param/without-root-param/non-empty-shell › shares the entry at lang=fresh category=fresh id=fresh with a fresh id value (id excluded from the cache key)
- `use-cache`: use-cache › should send an SWR cache-control header based on the revalidate and expire values
- `use-cache-custom-handler`: use-cache-custom-handler › should save a short-lived cache during prerendering at buildtime
- `use-cache-metadata-route-handler`: use-cache-metadata-route-handler › should generate sitemaps with a metadata route handler that uses "use cache"
- `use-cache-metadata-route-handler`: use-cache-metadata-route-handler › should generate multiple sitemaps with a metadata route handler that uses "use cache"
- `use-cache-metadata-route-handler`: use-cache-metadata-route-handler › should generate robots.txt with a metadata route handler that uses "use cache"
- `use-cache-metadata-route-handler`: use-cache-metadata-route-handler › should generate manifest.json with a metadata route handler that uses "use cache"
- `trailingslash`: app-dir trailingSlash handling › should revalidate a page with generated static params (withSlash=true)
- `trailingslash`: app-dir trailingSlash handling › should revalidate a page with generated static params (withSlash=false)
- `draft-mode`: app dir - draft mode › in nodejs runtime › should not generate rand when draft mode disabled during next start
- `headers-static-bailout`: headers-static-bailout › should not bailout when not using headers
- `custom-cache-control`: custom-cache-control › should have default cache-control for app-ssg another
- `next-after-app-api-usage`: nextjs APIs in after() › request APIs inside after() › cannot be called in a prerendered page › with `dynamic = "error"`
- `next-after-app-api-usage`: nextjs APIs in after() › request APIs inside after() › cannot be called in a prerendered page › with `dynamic = "force-static"`
- `next-after-app-api-usage`: nextjs APIs in after() › request APIs inside after() › can be called in a prerendered route handler with `dynamic = "force-static"`
- `next-after-app-api-usage`: nextjs APIs in after() › request APIs inside after() › can be called in a prerendered route handler with `dynamic = "error" (but throw, because dynamic should error)`
- `next-after-app-api-usage`: nextjs APIs in after() › draftMode status is readable, but cannot be changed › static page
- `next-after-app-api-usage`: nextjs APIs in after() › draftMode status is readable, but cannot be changed › static route handler
- `ppr-root-param-fallback`: ppr-root-param-fallback › should have use-cache content in fallback shells for all pregenerated locales
- `dynamic-data__main`: dynamic-data › should render empty objects for dynamic APIs when rendering with force-static
- `dynamic-data__main`: dynamic-data › should track dynamic apis when rendering app routes

</details>

<details><summary>31 × A page or an API route of the Pages Router. The plugin runs the routes of `app/`.</summary>

- `navigation`: app dir - navigation › query string › useParams identity between renders › should be stable in pages
- `navigation`: app dir - navigation › navigation between pages and app › should not contain \_rsc query while navigating from app to pages
- `navigation`: app dir - navigation › navigation between pages and app › should not contain \_rsc query while navigating from pages to app
- `navigation`: app dir - navigation › navigation between pages and app › should not omit the hash while navigating from app to pages
- `hooks`: app dir - hooks › from pages › should have the correct hooks at /adapter-hooks/static
- `hooks`: app dir - hooks › from pages › should have the correct hooks at /adapter-hooks/1
- `hooks`: app dir - hooks › from pages › should have the correct hooks at /adapter-hooks/2
- `hooks`: app dir - hooks › from pages › should have the correct hooks at /adapter-hooks/1/account
- `hooks`: app dir - hooks › from pages › should have the correct hooks at /adapter-hooks/static #2
- `hooks`: app dir - hooks › from pages › should have the correct hooks at /adapter-hooks/1 #2
- `hooks`: app dir - hooks › from pages › should have the correct hooks at /adapter-hooks/2 #2
- `hooks`: app dir - hooks › from pages › should have the correct hooks at /adapter-hooks/1/account #2
- `use-params`: use-params › should work on pages router
- `searchparams-reuse-loading`: searchparams-reuse-loading › when aliasing is skipped › should work for navigating to pages dir
- `metadata`: app dir - metadata › should not effect metadata images convention like files under pages directory
- `app-css`: app dir - css › pages dir › should include css modules and global css after page transition
- `css-server-chunks`: css-server-chunks › should not write CSS chunks for the server
- `use-cache`: use-cache › should revalidate caches during on-demand revalidation
- `app-middleware`: app-dir with middleware › Mutate request headers for Serverless Functions › Adds new headers
- `app-middleware`: app-dir with middleware › Mutate request headers for Serverless Functions › Deletes headers
- `app-middleware`: app-dir with middleware › Mutate request headers for Serverless Functions › Updates headers
- `app-middleware`: app-dir with middleware › Mutate request headers for Edge Functions › Adds new headers
- `app-middleware`: app-dir with middleware › Mutate request headers for Edge Functions › Deletes headers
- `app-middleware`: app-dir with middleware › Mutate request headers for Edge Functions › Updates headers
- `set-cookies`: set-cookies › for /pages › for edge runtime › should set two set-cookie headers
- `set-cookies`: set-cookies › for /pages › for experimental-edge runtime › should set two set-cookie headers
- `set-cookies`: set-cookies › for /pages › for node runtime › should set two set-cookie headers
- `custom-cache-control`: custom-cache-control › should have default cache-control for pages-ssg another
- `rsc-basic`: app dir - rsc basics › next internal shared context › should not error if just load next/navigation module in pages/api
- `rsc-basic`: app dir - rsc basics › should not apply rsc syntax checks in pages/api
- `rsc-basic`: app dir - rsc basics › should not use bundled react for pages with app

</details>

<details><summary>12 × An image that `ImageResponse` of `next/og` renders. Next renders it with WebAssembly and a font of its own, which it reads from its own files with `node:fs`, and the server's disk here has no file of the project.</summary>

- `metadata-dynamic-routes`: app dir - metadata dynamic routes › social image routes › should render og image with opengraph-image dynamic routes
- `metadata-dynamic-routes`: app dir - metadata dynamic routes › social image routes › should render og image with twitter-image dynamic routes
- `metadata-dynamic-routes`: app dir - metadata dynamic routes › social image routes › should support params as argument in dynamic routes
- `metadata-dynamic-routes`: app dir - metadata dynamic routes › icon image routes › should render icon with dynamic routes
- `metadata-dynamic-routes`: app dir - metadata dynamic routes › icon image routes › should render apple icon with dynamic routes
- `metadata-dynamic-routes`: app dir - metadata dynamic routes › should generate unique path for image routes under group routes
- `metadata-dynamic-routes-async-deps`: app dir - metadata dynamic routes with async deps › should serve the opengraph-image route as a valid image
- `metadata-font`: app dir - metadata font › should handle custom fonts in both edge and nodejs runtime
- `use-cache-metadata-route-handler`: use-cache-metadata-route-handler › should generate an opengraph image with a metadata route handler that uses "use cache"
- `use-cache-metadata-route-handler`: use-cache-metadata-route-handler › should generate an icon image with a metadata route handler that uses "use cache"
- `use-cache-metadata-route-handler`: use-cache-metadata-route-handler › should statically prerender an image whose component uses "use cache" directly
- `use-cache-metadata-route-handler`: use-cache-metadata-route-handler › should treat a twitter image that reads request data as dynamic

</details>

<details><summary>7 × A `"use cache"` function that a Client Component gets, as a prop or by an import. Next's compiler makes such a function a Server Action as well, which the client calls. Here it is not one: React does not pass it to the client, and a Client Component that imports it runs its module in the browser.</summary>

- `use-cache`: use-cache › should cache results for cached functions imported from client components
- `use-cache`: use-cache › should cache results for cached functions passed to client components
- `use-cache`: use-cache › works with useActionState if previousState parameter is not used in "use cache" function
- `use-cache`: use-cache › works with useActionState if previousState parameter is not used in "use cache" function (separate export)
- `use-cache`: use-cache › works with "use cache" in method props
- `use-cache`: use-cache › works with "use cache" in static class methods
- `use-cache-with-server-function-props`: use-cache-with-server-function-props › should be able to use nested cache functions as props

</details>

<details><summary>5 × A redirect or a navigation to another origin. The tab cannot leave the test.</summary>

- `navigation`: app dir - navigation › redirect › components › should redirect to external url
- `navigation`: app dir - navigation › redirect › components › should redirect to external url, initiating only once
- `navigation`: app dir - navigation › external push › should push external url without affecting hooks
- `actions`: app-dir action handling › Edge SSR › should handle calls to redirect() with external URLs
- `actions`: app-dir action handling › fetch actions › should handle calls to redirect() with external URLs

</details>

<details><summary>4 × Expects the HTML of a page that Next's build prerenders. Here the page renders for the request, as `next start` renders a dynamic page: React sends the `<link rel="preconnect">` of a font in the `Link` header, and a client navigation commits before the metadata that Next streams after the page.</summary>

- `next-font`: app dir - next/font › app dir - next-font › preconnect › should add preconnect when preloading is disabled in page
- `next-font`: app dir - next/font › app dir - next-font › preconnect › should add preconnect when preloading is disabled in layout
- `next-font`: app dir - next/font › app dir - next-font › preconnect › should add preconnect when preloading is disabled in component
- `next-font`: app dir - next/font › app dir - next-font › preconnect › should add preconnect when preloading is disabled in template

</details>

<details><summary>4 × Two requests at once, which Next lets share the work of a cached function, or a request while an earlier one regenerates a stale entry in the background. The server handles one request at a time, and a request waits up to a second for the background work of the one before it.</summary>

- `use-cache`: use-cache › should dedupe a streaming cache across concurrent requests
- `use-cache-route-handler-only`: use-cache-route-handler-only › dedupes tag revalidation across requests while generation is pending
- `use-cache-swr`: use-cache-swr › should dedupe SWR regens across concurrent requests
- `use-cache-swr`: use-cache-swr › should dedupe SWR regens across slow-read requests

</details>

<details><summary>2 × Counts the stylesheets of a page. Next's build puts the CSS files that a segment imports in one chunk. The run serves the CSS of the dev server, where each file is a stylesheet of its own.</summary>

- `app-css`: app dir - css › css support › special entries › should include css imported in loading.js
- `app-css`: app dir - css › css support › chunks › should bundle css resources into chunks

</details>

<details><summary>2 × Server code that reads a file of the project with `node:fs`, like `./posts/first-post.txt`. The server's disk is in memory, and has no file of the project.</summary>

- `use-cache-metadata-route-handler`: use-cache-metadata-route-handler › should generate an opengraph image with a custom (local) font
- `use-cache-metadata-route-handler`: use-cache-metadata-route-handler › should prerender a page that shares a segment with an opengraph image that uses a custom font

</details>

<details><summary>1 × A navigation while a Server Action is in flight. The server handles one request at a time.</summary>

- `actions`: app-dir action handling › should not block navigation events while a server action is in flight

</details>

<details><summary>1 × The CSS of a component of `next/dynamic`, which Next links from its manifest of dynamic imports, with `precedence="dynamic"`, next to a preload of its JavaScript. Here it is a stylesheet of the segment that imports the component.</summary>

- `dynamic-css`: app dir - dynamic css › should preload all chunks of dynamic component during SSR

</details>

<details><summary>1 × Expects the CSS that Next's build minified. The run serves the CSS that Vite compiles, as it is.</summary>

- `css-modules-pure-no-check`: css-modules-pure-no-check › should have emitted a CSS file

</details>

<details><summary>1 × A path that `generateStaticParams` does not list, of a route with `dynamicParams = false`. Next answers 404 for it from the paths its build prerendered. Here no build lists them, and the page renders.</summary>

- `root-layout`: app-dir root layout › Should do a mpa navigation when switching root layout › should work with static routes

</details>

<details><summary>1 × A navigation of Next's router to a route handler that answers with JSON, which a browser shows in place of the app. The tab cannot leave the test, so the page stays, with an uncaught error.</summary>

- `searchparams-reuse-loading`: searchparams-reuse-loading › when aliasing is skipped › should work for route handlers

</details>

<details><summary>1 × Opens the response of a route handler that a browser shows as it is, like plain text or JSON. The plugin opens the pages of the app, and the test stays where it is.</summary>

- `draft-mode-middleware`: app-dir - draft-mode-middleware › should be able to disable draft mode with middleware present

</details>

### Not Applicable: 164 Tests

<details><summary>37 × Reads the output of `next build`: a manifest, a chunk or a prerendered file in `.next`.</summary>

- `app-edge-root-layout`: app-dir edge runtime root layout › should mark static contain metadata routes as edge functions
- `actions`: app-dir action handling › should output exportName and filename info in manifest
- `actions`: app-dir action handling › should not expose action content in sourcemaps
- `app-routes`: app-custom-routes › works with api prefix correctly › statically generates correctly with no dynamic usage
- `app-routes`: app-custom-routes › works with api prefix correctly › does not statically generate with dynamic usage
- `app-routes`: app-custom-routes › works with generateStaticParams correctly › responds correctly on /static/first/data.json
- `app-routes`: app-custom-routes › works with generateStaticParams correctly › responds correctly on /static/second/data.json
- `app-routes`: app-custom-routes › works with generateStaticParams correctly › responds correctly on /static/three/data.json
- `app-routes`: app-custom-routes › works with generateStaticParams correctly › revalidates correctly on /revalidate-1/first/data.json
- `app-routes`: app-custom-routes › works with generateStaticParams correctly › revalidates correctly on /revalidate-1/second/data.json
- `app-routes`: app-custom-routes › works with generateStaticParams correctly › revalidates correctly on /revalidate-1/three/data.json
- `parallel-routes-and-interception`: parallel-routes-and-interception (trailingSlash: true) › route intercepting › should not have /default paths in the prerender manifest
- `parallel-routes-and-interception`: parallel-routes-and-interception (trailingSlash: false) › route intercepting › should not have /default paths in the prerender manifest
- `not-found__basic`: app dir - not-found - basic › should include not found client reference manifest in the file trace
- `not-found__basic`: app dir - not-found - basic › should use root not-found content for 404 html
- `not-found__basic`: app dir - not-found - basic › with default runtime › should create the 404 mapping and copy the file to pages
- `not-found__default`: app dir - not-found - default › should contain noindex contain in the page
- `metadata`: app dir - metadata › static routes › should build favicon.ico as a custom route
- `metadata`: app dir - metadata › static optimization › should build static files into static route
- `metadata-dynamic-routes`: app dir - metadata dynamic routes › sitemap › should optimize routes without multiple generation API as static routes
- `metadata-dynamic-routes`: app dir - metadata dynamic routes › sitemap › should generate static paths of dynamic sitemap in production
- `metadata-dynamic-routes`: app dir - metadata dynamic routes › route segment config › should generate dynamic route if dynamic config is force-dynamic
- `metadata-dynamic-routes`: app dir - metadata dynamic routes › should support edge runtime of image routes
- `metadata-dynamic-routes`: app dir - metadata dynamic routes › should include default og font files in file trace
- `metadata-dynamic-routes`: app dir - metadata dynamic routes › should contain generated routes in prerender manifest
- `use-cache`: use-cache › should prerender fully cacheable pages as static HTML
- `use-cache`: use-cache › should match the expected revalidate and expire configs on the prerender manifest
- `use-cache`: use-cache › should match the expected stale config in the page header
- `use-cache`: use-cache › should propagate unstable_cache tags correctly
- `use-cache-fallback-root-params`: use-cache-fallback-root-params › omits root-dependent entries from the RDC used to build generic shells
- `use-cache-fallback-root-params`: use-cache-fallback-root-params › keeps cached root content in shells whose root is known
- `use-cache-fallback-root-params`: use-cache-fallback-root-params › preserves static-prefetch hints when only fallback roots are missing
- `use-cache-fallback-root-params`: use-cache-fallback-root-params › does not mistake searchParams in a cached page for a fallback root read
- `use-cache-infinity-profile`: use-cache-infinity-profile › caches forever with a configured profile using Infinity revalidate and expire
- `use-cache-metadata-route-handler`: use-cache-metadata-route-handler › should include the client reference manifest in the route.js.nft.json files of dynamic metadata routes
- `use-cache-metadata-route-handler`: use-cache-metadata-route-handler › should not include the client reference manifest in the route.js.nft.json files of static metadata routes
- `use-cache-root-param-metadata`: use-cache-root-param-metadata › emits root param dependencies only in Turbopack production

</details>

<details><summary>32 × Asks for another app than the fixture: files of its own, or another `next.config`. The runner runs one app for a fixture, the fixture as it is or as `fixtures.ts` prepares it.</summary>

- `interception-route-prefetch-cache`: interception-route-prefetch-cache › runtime = edge › should render the correct interception when two distinct layouts share the same path structure
- `parallel-routes-and-interception`: parallel-routes-and-interception (trailingSlash: true) › parallel routes › should support parallel route tab bars
- `parallel-routes-and-interception`: parallel-routes-and-interception (trailingSlash: true) › parallel routes › should match parallel routes
- `parallel-routes-and-interception`: parallel-routes-and-interception (trailingSlash: true) › parallel routes › should match parallel routes in route groups
- `parallel-routes-and-interception`: parallel-routes-and-interception (trailingSlash: true) › parallel routes › should throw a 404 when no matching parallel route is found
- `parallel-routes-and-interception`: parallel-routes-and-interception (trailingSlash: true) › parallel routes › should render nested parallel routes
- `parallel-routes-and-interception`: parallel-routes-and-interception (trailingSlash: true) › parallel routes › should support layout files in parallel routes
- `parallel-routes-and-interception`: parallel-routes-and-interception (trailingSlash: true) › parallel routes › should only scroll to the parallel route that was navigated to
- `parallel-routes-and-interception`: parallel-routes-and-interception (trailingSlash: true) › parallel routes › should apply the catch-all route to the parallel route if no matching route is found
- `parallel-routes-and-interception`: parallel-routes-and-interception (trailingSlash: true) › parallel routes › should match the catch-all routes of the more specific path, if there is more than one catch-all route
- `parallel-routes-and-interception`: parallel-routes-and-interception (trailingSlash: true) › parallel routes › should navigate with a link with prefetch=false
- `parallel-routes-and-interception`: parallel-routes-and-interception (trailingSlash: true) › parallel routes › should display all parallel route params with useParams
- `parallel-routes-and-interception`: parallel-routes-and-interception (trailingSlash: true) › parallel routes › should load CSS for a default page that exports another page
- `parallel-routes-and-interception`: parallel-routes-and-interception (trailingSlash: true) › parallel routes › should handle a loading state
- `parallel-routes-and-interception`: parallel-routes-and-interception (trailingSlash: true) › route intercepting with dynamic routes › should render intercepted route
- `parallel-routes-and-interception`: parallel-routes-and-interception (trailingSlash: true) › route intercepting with prerendered dynamic routes › should render intercepted route
- `parallel-routes-and-interception`: parallel-routes-and-interception (trailingSlash: true) › route intercepting with dynamic optional catch-all routes › should render intercepted route
- `parallel-routes-and-interception`: parallel-routes-and-interception (trailingSlash: true) › route intercepting with dynamic catch-all routes › should render intercepted route
- `parallel-routes-and-interception`: parallel-routes-and-interception (trailingSlash: true) › route intercepting › should render intercepted route
- `parallel-routes-and-interception`: parallel-routes-and-interception (trailingSlash: true) › route intercepting › should render an intercepted route from a slot
- `parallel-routes-and-interception`: parallel-routes-and-interception (trailingSlash: true) › route intercepting › should render an intercepted route at the top level from a nested path
- `parallel-routes-and-interception`: parallel-routes-and-interception (trailingSlash: true) › route intercepting › should render intercepted route from a nested route
- `parallel-routes-and-interception`: parallel-routes-and-interception (trailingSlash: true) › route intercepting › should re-render the layout on the server when it had a default child route
- `parallel-routes-and-interception`: parallel-routes-and-interception (trailingSlash: true) › route intercepting › should render modal when paired with parallel routes
- `parallel-routes-and-interception`: parallel-routes-and-interception (trailingSlash: true) › route intercepting › should support intercepting with beforeFiles rewrites
- `parallel-routes-and-interception`: parallel-routes-and-interception (trailingSlash: true) › route intercepting › should support intercepting local dynamic sibling routes
- `parallel-routes-and-interception`: parallel-routes-and-interception (trailingSlash: true) › route intercepting › should intercept on routes that contain hyphenated/special dynamic params
- `parallel-routes-and-interception`: parallel-routes-and-interception-conflicting-pages › should gracefully handle when two page segments match the `children` parallel slot
- `parallel-routes-and-interception-from-root`: parallel-routes-and-interception-from-root, collapseAdapterRoutes: false › should interpolate [locale] in "/[locale]/example/(...)[locale]/intercepted"
- `not-found__conflict-route`: app dir - not-found - conflict route › with edge runtime › should use the not-found page for non-matching routes
- `not-found__conflict-route`: app dir - not-found - conflict route › with edge runtime › should allow to have a valid /not-found route
- `not-found__group-route`: app dir - not-found - group route › with edge runtime › should use the not-found page under group routes

</details>

<details><summary>16 × The test itself needs Node.js: it starts a server, or removes a directory.</summary>

- `rewrite-with-search-params`: rewrite-with-search-params › should not contain params in search params after rewrite
- `metadata`: app dir - metadata › icons › should support root level of favicon.ico
- `metadata-static-file`: metadata-files-static-output-dynamic-route › should serve static files when requested with placeholder for dynamic page
- `metadata-static-file`: metadata-files-static-output-group-route › should serve static files when requested to its route for group page
- `metadata-static-file`: metadata-files-static-output-intercepting-route › should serve static files when requested to its route for intercepting page
- `metadata-static-file`: metadata-files-static-output-parallel-route › should serve static files when requested to its route for parallel slot page
- `metadata-static-file`: metadata-files-static-output-root-route › should serve static files when requested to its route
- `metadata-static-file`: metadata-files-static-output-static-route › should serve static files when requested to its route for static page
- `next-image`: app dir - next-image › ssr content › should handle HEAD requests for uncached images
- `css-bom`: app dir - css with a UTF-8 BOM › keeps the BOM in the fixture
- `cache-components`: cache-components › should ignore late setHeader calls for direct RSC handlers after headers are sent
- `x-forwarded-headers`: x-forwarded-headers › host header exists › should include x-forwarded-\* headers relative to host
- `x-forwarded-headers`: x-forwarded-headers › already assigned › should not override existing x-forwarded-\* headers
- `next-after-app`: after() in nodejs runtime › only runs callbacks after the response is fully sent
- `next-after-app`: after() in edge runtime › only runs callbacks after the response is fully sent
- `rsc-basic`: app dir - rsc basics › should generate edge SSR manifests for Node.js

</details>

<details><summary>16 × Changes a file of the app, or builds or starts the app itself.</summary>

- `not-found__basic`: app dir - not-found - basic › with runtime = edge › should return 404 status if notFound() is called in shell
- `not-found__basic`: app dir - not-found - basic › with runtime = edge › should use the not-found page for non-matching routes
- `not-found__basic`: app dir - not-found - basic › with runtime = edge › should match dynamic route not-found boundary correctly
- `not-found__basic`: app dir - not-found - basic › with runtime = edge › should escalate notFound to parent layout if no not-found boundary present in current layer
- `experimental-lightningcss-features`: experimental-lightningcss-features › include › should transpile light-dark() when included in lightningCssFeatures
- `experimental-lightningcss-features`: experimental-lightningcss-features › custom-media-queries › should substitute @custom-media when custom-media-queries is included
- `experimental-lightningcss-features`: experimental-lightningcss-features › exclude › should preserve light-dark() when excluded from lightningCssFeatures
- `use-cache-custom-handler`: use-cache-custom-handler › handles a failed handler preload without an unhandled rejection
- `use-cache-route-handler-only`: use-cache-route-handler-only › should dedupe concurrent cache invocations in route handlers
- `headers-static-bailout`: headers-static-bailout › it provides a helpful link in case static generation bailout is uncaught
- `next-after-app`: after() in nodejs runtime › uses waitUntil from request context if available › in a page
- `next-after-app`: after() in nodejs runtime › uses waitUntil from request context if available › in a route handler
- `next-after-app`: after() in nodejs runtime › uses waitUntil from request context if available › in middleware
- `next-after-app`: after() in edge runtime › uses waitUntil from request context if available › in a page
- `next-after-app`: after() in edge runtime › uses waitUntil from request context if available › in a route handler
- `next-after-app`: after() in edge runtime › uses waitUntil from request context if available › in middleware

</details>

<details><summary>14 × Uses `createRouterAct()` of Next's test library, which holds back the requests of the router and answers them with Playwright's `page.route()`.</summary>

- `concurrent-navigations`: mismatching prefetch › recovers when a navigation rewrites to a different route than the one that was prefetched
- `interception-dynamic-segment`: interception-dynamic-segment › Default.tsx injection validation (no 404s allowed) › should not render a 404 for the intercepted route with dynamic segments
- `interception-dynamic-segment`: interception-dynamic-segment › Default.tsx injection validation (no 404s allowed) › should navigate to /simple-page without 404 (no parallel routes)
- `interception-dynamic-segment`: interception-dynamic-segment › Default.tsx injection validation (no 404s allowed) › should navigate to /has-page without 404 (page fills children)
- `interception-dynamic-segment`: interception-dynamic-segment › Default.tsx injection validation (no 404s allowed) › should navigate to /no-parallel-routes/deeper without 404
- `interception-dynamic-segment`: interception-dynamic-segment › Default.tsx injection validation (no 404s allowed) › should navigate to /has-both without 404 (has both @sidebar and page)
- `interception-dynamic-segment`: interception-dynamic-segment › Default.tsx injection validation (no 404s allowed) › should retain named host slots instead of rendering their defaults
- `interception-dynamic-segment`: interception-dynamic-segment › Default.tsx injection validation (no 404s allowed) › should retain named host slots for an interception catch-all
- `interception-dynamic-segment`: interception-dynamic-segment › Default.tsx injection validation (no 404s allowed) › should send and render a real default for a newly entered slot owner
- `interception-dynamic-segment`: interception-dynamic-segment › Default.tsx injection validation (no 404s allowed) › should omit undeclared children and preserve parent state
- `interception-dynamic-segment`: interception-dynamic-segment › Default.tsx injection validation (no 404s allowed) › should navigate to /test-nested/deeper without 404
- `interception-dynamic-segment`: interception-dynamic-segment › Default.tsx injection validation (no 404s allowed) › should navigate to /explicit-layout/deeper without 404
- `interception-dynamic-segment`: interception-dynamic-segment › Default.tsx injection validation (no 404s allowed) › should handle repeated interceptions without 404
- `interception-dynamic-segment`: interception-dynamic-segment › Default.tsx injection validation (no 404s allowed) › should navigate between different interception routes without 404

</details>

<details><summary>13 × Opens the page with JavaScript off. The test runs in the tab of the page.</summary>

- `actions`: app-dir action useActionState › should support submitting form state without JS
- `actions`: app-dir action useActionState › should send the action to the provided permalink with form state when JS disabled
- `actions`: app-dir action progressive enhancement › should support formData and redirect without JS
- `actions`: app-dir action progressive enhancement › should support actions from client without JS
- `actions`: app-dir action progressive enhancement › should support headers and cookies without JS (runtime: edge)
- `actions`: app-dir action progressive enhancement › should support headers and cookies without JS (runtime: node)
- `actions`: app-dir action handling › should support setting cookies when redirecting (no javascript)
- `actions`: app-dir action handling › should support notFound (javascript disabled)
- `actions-unrecognized`: unrecognized server actions › should error and log a warning when submitting a server action with an unrecognized ID - nodejs › server action invoked via form - js disabled
- `actions-unrecognized`: unrecognized server actions › should error and log a warning when submitting a server action with an unrecognized ID - edge › server action invoked via form - js disabled
- `use-cache`: use-cache › should not read nor write cached data when draft mode is enabled › js disabled, with cookies
- `use-cache`: use-cache › should not read nor write cached data when draft mode is enabled › js disabled, without cookies
- `use-cache`: use-cache › should allow nested short-lived caches after connection()

</details>

<details><summary>10 × Reads what the Next.js CLI prints: the table of routes of a build, a warning when it starts, or what Tailwind logs as the build compiles the CSS.</summary>

- `interception-dynamic-segment`: interception-dynamic-segment › should correctly prerender segments with generateStaticParams
- `interception-dynamic-segment`: interception-dynamic-segment › should prerender a dynamic intercepted route
- `metadata-static-file`: metadata-files-static-output-dynamic-route › should display static metadata files with "-" placeholder in build output
- `no-double-tailwind-execution`: no-double-tailwind-execution › should run tailwind only once initially and per change
- `revalidate-dynamic`: app-dir revalidate-dynamic › should correctly mark a route handler that uses revalidateTag as dynamic
- `unstable-rethrow`: unstable-rethrow › should correctly mark the dynamic page as dynamic
- `use-cache`: use-cache › should warn that the `experimental.useCache` config option is deprecated
- `app-middleware`: app-dir with middleware › should warn when deprecated middleware file is used
- `dynamic-data__require-static`: dynamic-data with dynamic = "error" › error when the build when `dynamic = "error"` and dynamic data is read
- `dynamic-data__cache-scoped`: dynamic-data inside cache scope › error when the build when accessing dynamic data inside a cache scope

</details>

<details><summary>10 × Uses Playwright's `Page` itself: `page.route()` to stand in for a response, or an event of a frame.</summary>

- `searchparams-reuse-loading`: searchparams-reuse-loading › Without Middleware › should correctly return different RSC data for full prefetches with different searchParam values
- `searchparams-reuse-loading`: searchparams-reuse-loading › With Middleware › should correctly return different RSC data for full prefetches with different searchParam values
- `searchparams-reuse-loading`: searchparams-reuse-loading › should re-use loading from "full" prefetch for param-full URL when navigating to param-less route
- `searchparams-reuse-loading`: searchparams-reuse-loading › should re-use loading from "full" prefetch for param-less URL when navigating to param-full route
- `searchparams-reuse-loading`: searchparams-reuse-loading › should re-use loading from "full" prefetch for param-full URL when navigating to param-full route
- `actions`: app-dir action handling › should propagate errors from a `text/plain` response to an error boundary
- `actions`: app-dir action handling › should trigger an error boundary for action responses with an invalid content-type
- `actions`: app-dir action handling › should be possible to catch network errors
- `actions`: app-dir action handling › fetch actions › should handle redirects to routes that provide an invalid RSC response
- `redirect-rewrite-dynamic`: redirect to a rewritten dynamic route (#95195) › client-side navigation to /a should update the URL to /

</details>

<details><summary>7 × Counts the requests of a page load, a form post or a redirect. The shim sees what the page fetches, not what the plugin fetches to load a page.</summary>

- `navigation`: app dir - navigation › redirect › components › should only trigger the redirect once (/redirect/servercomponent)
- `navigation`: app dir - navigation › redirect › components › should only trigger the redirect once (redirect/redirect-with-loading)
- `navigation`: app dir - navigation › navigation between pages and app › should not continously initiate a mpa navigation to the same URL when router state changes
- `actions`: app-dir action handling › redirects › redirects properly when route handler uses `redirect`
- `actions`: app-dir action handling › redirects › redirects properly when route handler uses `permanentRedirect`
- `actions`: app-dir action handling › redirects › redirects properly when route handler redirects with a 307 status code
- `actions`: app-dir action handling › redirects › redirects properly when route handler redirects with a 308 status code

</details>

<details><summary>3 × Passes `env` to `nextTestSetup()` for `next.config` to read. The runner loads the config once, before the first test, so every `describe` gets the same app.</summary>

- `react-max-headers-length`: react-max-headers-length › reactMaxHeadersLength = 0 › should respect reactMaxHeadersLength
- `react-max-headers-length`: react-max-headers-length › reactMaxHeadersLength = 400 › should respect reactMaxHeadersLength
- `react-max-headers-length`: react-max-headers-length › reactMaxHeadersLength = 10000 › should respect reactMaxHeadersLength

</details>

<details><summary>3 × Expects only the log of a Server Component's error as `next start` prints it: after a `⨯`, without the frames of Next. The server logs it to the tab's console, with the stack of the browser, and the client's own log of the error is in the same console.</summary>

- `errors`: app-dir - errors › error component › should trigger error component when undefined is thrown during server components rendering
- `errors`: app-dir - errors › error component › should trigger error component when null is thrown during server components rendering
- `errors`: app-dir - errors › error component › should trigger error component when a string is thrown during server components rendering

</details>

<details><summary>2 × Expects the `history.length` of a new tab. The tests of a file share the history of the tab, which ends at 50 entries.</summary>

- `navigation`: app dir - navigation › browser back after a push followed by a refresh › should load the previous page
- `actions`: app-dir action handling › should replace current route when redirecting with type set to replace

</details>

<details><summary>1 × Expects the cookie that an earlier test of the file set. The plugin's `cleanup()` clears the cookies after every test.</summary>

- `actions`: app-dir action handling › fetch actions › should revalidate when cookies.set is called in a client action

</details>

<!-- conformance:results:end -->

## What The Results Say

Where the plugin runs something, it mostly runs it as Next does: 949 of the 956 tests that are neither a missing feature nor out of reach pass. What does not pass is, for nine tests out of ten, something the plugin does not do at all, or something a test in a browser cannot see.

**Bugs: 7 tests, 4 causes.** All are in the list above, and all four are fixed since this run: two `Set-Cookie` headers of one rule of `headers()` in `next.config`, what the proxy hands to `waitUntil()`, which now has its request stores, and two modules that the ssr layer had as Next's edge runtime has them, `react-dom/server` for a Client Component that calls `renderToStaticMarkup()` and `next/router` in a Server Component. `conformance/expectations.json` has no test that fails for a bug in the plugin, and the next run with `--docs` takes them out of the table.

**Not Yet: 191 tests.** The largest cause is more than half of them: **a page that a build prerenders**, 118 tests, 101 of them in the fixtures of `"use cache"` and Cache Components. `next build` renders such a page once and keeps it, and here every request renders its page: see "The Node.js Runtime" in `docs/next-routes.md`. Then **the Pages Router**, 31 tests: fixtures of the App Router have a `pages/` directory to test the two together, its pages and its API routes. Then `ImageResponse` of `next/og`, 12 tests.

Three causes are not in the "Not Yet" list of `docs/next-routes.md`: the Pages Router, the chunks and the minified CSS of a build (3 tests), and a path that `dynamicParams = false` leaves out, which Next answers 404 for from the paths its build prerendered (1).

**Not applicable: 164 tests.** The largest causes are the output of a build (37), another app than the fixture's, with files or a `next.config` of its own (32), a test that itself needs Node.js (16) or changes a file of the app (16), `createRouterAct()` of Next's test library (14), and JavaScript off (13).

**The server in front of the app.** Five fixtures are there for the proxy, the redirects and rewrites of `next.config`, and `trailingSlash`. 38 of their 48 tests pass. Of the 10 that do not, 6 ask for an API route of the Pages Router, 2 expect a prerendered page, and 2 cannot run in a browser.

**CSS.** 23 fixtures are Next's own tests of CSS: global CSS and CSS modules, their order, client navigation, parallel routes, `next/dynamic`, inline CSS, the pure mode of a CSS module, Sass, Tailwind 3 and 4, a PostCSS config with plugins of its own, and an MDX page with `@next/mdx`. The runner installs the packages their tests install, and links Tailwind 4 into the copy of the one fixture that asks for it, as it has Tailwind 3 under the name. 66 of their 77 tests pass, and none fails for a bug of the plugin. Of the 11 that do not, 3 give each test a `next.config` of its own, for `experimental.lightningCssFeatures`, 2 count the stylesheets of a page, which Next's build puts in chunks and the run does not yet, 2 ask for the Pages Router, 1 reads a file with Node.js, 1 expects CSS that Next's build minified, which the run does not yet, 1 counts what Tailwind logs as the build compiles, and 1 expects the CSS of a component of `next/dynamic` from Next's manifest of dynamic imports. Of `scss`, a directory of 40 apps, only `scss-mixins` has an `app/`; the others are apps of the Pages Router and do not run here. Nor do three more of Next's fixtures for CSS: one builds its app out of files its test names, two only Turbopack runs. `conformance/src/fixtures.ts` says which.

### Found Along The Way

What the list above does not have:

- **A pending refresh outlived its page.** Fixed with the runner: see "What Stands In For A Server" in `docs/next-routes.md`. Next sends a `<meta http-equiv="refresh">` with a `redirect()` in a response that had started. It came due a second later, in the page of the next test, or between two tests, where nothing stopped the tab from leaving and the rest of the test file did not run.
- **`history.back()` past the entry a page was opened in leaves the test.** The tab goes back to the test runner's own entry, and Vitest loses the tab.
- **The first run of an app can fail where the second passes.** With a cold cache, Vite finds `next/legacy/image` for the `ssr` layer while a test runs, and pre-bundles again. The page that asked for it gets a 404. Two tests of `next-image` fail that way on a fresh checkout, and pass from then on. The runner runs such a fixture again and says so.
- **The order of cascade layers after an `@import` with `layer()`.** Fixed in the plugin. `postcss-import`, with which Vite inlines an `@import`, put an `@layer` statement that follows the import before the CSS of the import, so the layers came in another order than the stylesheet names them (`app-css`). The plugin now declares the layers of the imports at the top of such a stylesheet.
- **An `.mdx` page with `@next/mdx`.** Fixed in the plugin: it applies the rules and aliases of a `webpack` function in `next.config` (`app-css`).
- **The size of the tab.** Vitest opens a tab the size of a phone, and Playwright's page, which Next's tests use, is 1280 by 720. A media query of the app's CSS tells them apart (`app-css`, with Pico CSS). The runner gives the tab Playwright's size.
- **Next's router rendered a page again as it loaded.** Fixed in the plugin: see "What Stands In For A Server" in `docs/next-routes.md`. The entry of the history that the tab's document was loaded in, `navigation.activation`, is the test runner's. Next's router took the page's entry for a back or forward navigation that it missed while it hydrated, once an earlier test had navigated, and restored itself from the history: `useParams()` gave a new object.
- **`handleRequest()` answers 404 for `/_next/image` and the files of fonts and images.** The dev server serves those, and `handleRequest()` only reaches the routes of the app, where a `fetch` of the page finds both.

## Running It

```sh
pnpm conformance                        # every fixture
pnpm conformance navigation actions     # the fixtures with one of these in their id
pnpm conformance hooks --grep rewrite   # the tests of a fixture whose name matches
pnpm conformance --update               # write what the run found to expectations.json
pnpm conformance --docs                 # write the results above
pnpm conformance --help
```

It needs Chromium for Playwright, like `pnpm test`, and a network: for the fixtures, and for a server that some of their apps fetch from. It runs the source of the plugin, so there is nothing to build first.

A run ends with what is different from `conformance/expectations.json`, and fails if anything is:

```
FAILED, and expectations.json does not say so: navigation > navigation.test.ts > app dir - navigation > ...
PASSED, and expectations.json says it fails (pages-router): hooks > hooks.test.ts > ...
```

A fixture whose run is not what the file says runs once more, and the second run counts. So a test that waited just too short on a busy machine does not pass for a change of the plugin. The run names every test that ended otherwise the second time: such a test has no result to rely on.

With `--grep` only the tests that ran are compared. The output of each fixture is in `conformance/.work/logs`, and the results of the run in `conformance/.results`.

### Another Plugin

```sh
pnpm conformance --plugin ../vitest-plugin-rsc-other --label other
```

runs the plugin of another checkout of this repository, with the runner, the fixtures and the expectations of this one. That checkout needs `pnpm install`. What the run prints is the comparison: the tests that pass there and fail here, and the other way around.

The plugin looks for the packages of Next.js from the app, which is a copy of a fixture under `conformance/`. So `conformance/package.json` has `@next/routing` next to `next`, at the same version, for a plugin that resolves the route of a request with it.

## How It Works

### The Tests Run In The Tab

A test of Next starts an app with `nextTestSetup({ files: __dirname })` and gets `next`: `next.fetch()`, `next.render$()`, and `next.browser(url)`, which opens the page in a browser that Playwright drives from Node.js.

The plugin runs the app in the tab of the test. So the test file runs there too, unchanged, on a shim of what it imports:

| The test imports                                                      | Here                                                                                                                                                                                                                           |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `nextTestSetup`, `next` (`e2e-utils`)                                 | `shim/e2e-utils.ts`, `shim/next-instance.ts`. `next.fetch()` is `handleRequest()`, without the cookies of the browser, as the `fetch` of Node.js. `next.browser()` is `renderServer({ url })`                                  |
| The browser of `next.browser()`                                       | `shim/browser.ts`: Next's chainable wrapper of a Playwright page, written against the DOM. A selector is `document.querySelector`, `eval` is `eval`, and a click is the real one that Vitest's `userEvent` asks Playwright for |
| `retry`, `check`, `waitFor` and the other helpers (`next-test-utils`) | `shim/next-test-utils.ts`, with the bodies of Next's own                                                                                                                                                                       |
| `describe`, `it`, `expect`, `jest`, and Jest's `expect` package       | Vitest's, with the matchers of `jest-extended`, which Next's Jest setup adds                                                                                                                                                   |
| `// @gate`, `// @force-gate` and `gate()` (`next-test-utils`)         | `shim/gate.ts`: Next's own rule for a test that only holds in some runs, and the conditions that `gate()` reads                                                                                                                |
| `path`, `cheerio`, `stream`, `escape-string-regexp`                   | `pathe`, cheerio, a `Readable` that `next.fetch()` sends as a stream, and the function of `escape-string-regexp`                                                                                                               |
| `fs`, `http`, `playwright` and the like                               | A stand-in that can be imported and not called, but for what the tab has too: `randomUUID()` of `crypto`                                                                                                                       |

What a test asks for that a tab cannot give, the shim throws as `Unsupported`, with what it was. The runner reports such a test as not applicable, with that reason.

The 163 fixtures have 181 test files, 28,000 lines. When the suite had 32 fixtures, their 34 test files used 17 members of `next`, 29 methods of the browser and 15 helpers of `next-test-utils`. Of `next`, 13 work and 4 are refused with a reason: `patchFile`, `renameFile` and `deleteFile`, which change a file of the app, and `getPrerenderFilePath`. All 29 of those methods of the browser work. Of the helpers, 12 work; refused are the two that read the dev overlay, and `listClientChunks`, which reads a build.

### The Fixtures Come From Next's Repository

The tests are not in the `next` package. The runner fetches them from `vercel/next.js` at the tag of the installed `next`, into `conformance/.next-repo`, which git ignores: a shallow, blobless, sparse clone of `test/lib` and of the directories in `conformance/src/fixtures.ts`. That is 24 MB for the 163 fixtures, 14 MB of it the tests. The whole repository is gigabytes.

So the tests are always the ones of the Next.js that runs. A fixture is a directory and the test files in it to run:

```ts
appDir("navigation", "navigation", ["navigation.test.ts"]),
```

### One Vitest Run Per Fixture

The plugin loads one app per Vitest project, when the project starts. A fixture is an app. The runner copies it to `conformance/.work/apps`, as Next's own setup copies it to a temporary directory, and starts a run of Vitest for it, with `conformance/vitest.config.ts` and the copy as its root. Four at a time by default.

A run of its own costs a few seconds, and it keeps the fixtures apart: an app that the plugin rejects, a test that hangs or a tab that is lost ends that fixture and no other. Vite keeps the pre-bundled dependencies of each fixture in `conformance/.work/cache`.

|                        | Cold | Warm |
| ---------------------- | ---: | ---: |
| `hello-world`, 4 tests |  7 s |  4 s |

A test gets a minute, as in Next's own runs, and a fixture half an hour. A test that fails often does so by waiting for something until its time is up, so the failures are most of what a run takes.

### A Run Is `next start`

Next runs every test in two modes, `dev` and `start`, and a test asks which one it is in. The plugin runs Next's runtime the way `next build` and `next start` do: no dev overlay, no HMR. So a run is in `start` mode. `--mode dev` runs the tests as Next's `dev` runs would, to see what differs.

A run in `start` mode sets the plugin's `build` option to `"production"`: Next's runtime and React run their production code, as `next start` runs what `next build` built. So the client gets a digest and React's minified message for an error of a Server Component, and Strict Mode runs an effect once. A run in `dev` mode sets it to `"development"`, as `next dev` runs. See "Development Or Production" in `docs/next-routes.md`. Each mode has its own cache of pre-bundled dependencies, in `conformance/.work/cache/<mode>`.

### Expectations

`conformance/expectations.json` has, for every fixture, how many of its tests pass and every test that fails with the key of a reason, and the reasons with their kind:

```json
{
  "reasons": {
    "pages-router": {
      "category": "not-yet",
      "text": "A page or an API route of the Pages Router. The plugin runs the routes of `app/`."
    },
    "javascript-off": {
      "category": "not-applicable",
      "text": "Opens the page with JavaScript off. The test runs in the tab of the page.",
      "match": "a page with JavaScript off"
    }
  },
  "fixtures": {
    "use-params": {
      "passed": 6,
      "failed": {
        "use-params.test.ts > use-params > should work on pages router": "pages-router"
      }
    }
  }
}
```

There are three kinds:

- **A bug in the plugin**: something the plugin runs, and runs differently than Next.
- **Not Yet**: something the plugin does not do, like the Pages Router. Most of these are in the list of `docs/next-routes.md`.
- **Not applicable**: a test of something that is not there to test. The output of `next build`, what the CLI prints, the dev overlay, a prerendered file, or a test that needs a browser of its own.

A run fails on every result that the file does not have:

- a test that fails and is not in the file, or that is in the file and passes, is skipped or is gone,
- a test that fails with a message that the `match` of its reason does not fit: it fails for another reason now,
- a fixture with another number of passing tests, which is how a test that passed and is skipped or gone since is seen,
- a fixture whose run did not get to its end.

`--update` writes the file anew from a run: a test that still fails keeps its reason, one that passes is taken out, and a new failure gets the first reason whose `match` fits its message, or `untriaged`. A fixture whose run did not get to its end stays as it was.

## What A Test In The Page's Own Tab Cannot Do

For Next's tests a page is a tab of its own, driven from outside. Here the test is in the tab. These are the tests that cannot be run that way, whatever the plugin does:

- **JavaScript off.** Next tests progressive enhancement with `next.browser(url, { disableJavaScript: true })`. A tab without JavaScript runs no test.
- **Playwright's `Page`.** `page.route()` to stand in for a response or fail a request, and `page.on("framenavigated")`. The shim does give `beforePageLoad` a page with `on("request")`, `on("response")` and `on("console")`.
- **The requests of a page load.** The shim sees what the page fetches: the requests of Next's router, of Server Actions and of the app. It does not see what the plugin fetches for a page load, or the hops of a redirect the plugin follows.
- **A history of its own.** All tests of a file share the history of the tab, which the browser cuts off at 50 entries. A test that counts on `history.length` of a new tab finds another number.
- **Two consoles.** The server is in the tab, so `next.cliOutput` and `browser.log()` read the same console. A test that counts the lines of one side finds the lines of the other too.
- **A window of its own.** `window` outlives a page load here. The shim takes what a test set on it with `browser.eval()` off when a page loads, so that `window.beforeNav` still tells a navigation on the client from a page load.
- **Another context.** A locale, a user agent or permissions of the browser, and a second tab.

And these are tests of something that is not there:

- The output of `next build`: `.next/`, the manifests, the chunks, the route table the build prints.
- A prerendered file, and what `next start` logs.
- The dev overlay and HMR. `next.patchFile()` changes a file of the app; nothing builds it again here.
- A test that starts a server of its own, in Node.js.

## What The Runner Adds

A test of Next expects a browser and a server. Where the tab is neither, the runner fills in, and each of these is a place where a passing test says less about the plugin than it seems to:

- **A request without CORS.** The server's `fetch` is the tab's, so a Server Component that fetches from a server without CORS headers gets nothing: see "Server Code In The Browser" in `docs/next-routes.md`. Many of Next's fixtures fetch from `next-data-api-endpoint.vercel.app`, which has none. The runner has Playwright answer for that host with the headers added, so that a test of the Data Cache measures the cache.
- **A page that redirects while it loads.** `renderServer()` is done when the first page has hydrated, which can be before a `redirect()` in a response that had started has taken the router to the next page, and it rejects when the app left the page before that. `next.browser()` waits for the page it ends up on instead, like Playwright's `goto`.
- **`back()` stays in the page.** `history.back()` past the entry a page was opened in would leave the test. The shim throws instead.
- **Cookies through a Server Action.** The app's cookies are the plugin's, not the browser's own. `browser.addCookie()` and `browser.deleteCookies()` set and delete them with `cookies()` in `runInServerAction()`, as a Server Action of the app would, where Playwright has the browser do it.
- **`/_next/` goes to the dev server.** `next.fetch()` is `handleRequest()`, which reaches the routes of the app. Fonts, images and Next's image optimizer are the dev server's here, so those requests are the tab's `fetch`.
- **A moment for React.** A call of Playwright is a round trip, and React has rendered what was scheduled by the time it arrives. The shim waits a tick before each call.
- **A second run.** A fixture whose run is not what the expectations say runs again, and the second run counts. That takes a cold cache and a busy machine out of the results, and it would take a test that fails one time in two out of them as well. The run names every test that ended otherwise the second time.

## Adding A Fixture

Add it to `conformance/src/fixtures.ts`, run `pnpm conformance <id> --update`, and give each new failure in `expectations.json` a reason. A reason is worth the look: the same message can be a bug in the plugin in one test and a missing feature in the next. `--grep` and `--print`, which shows what the page and the server log, help with one test.

A package that a test lists in `dependencies` goes into `conformance/package.json`, at the version the test asks for. Another major of a package the runner has already, like Tailwind 4 next to Tailwind 3, is an npm alias there, which `linked` of the fixture links into `node_modules` of its copy under the package's own name.

A fixture whose test passes `nextConfig`, `buildArgs` or `overrideFiles` to `nextTestSetup()` asks Next to change the app before it builds. The runner cannot do that when the test asks, so those tests are not applicable, unless the fixture says what to do to the copy instead: see `prepared` of `trailingslash`, and of `parallel-routes-and-interception`, whose copy has the `next.config` that one of its two `nextConfig`s asks for. A test file that starts two apps, one in each of its `describe`s, from directories of its own like `fixtures/main`, is a fixture for each app: `app` of the fixture says which, and the tests of the other apps are left out of its results. Two apps that one test needs cannot run at all.
