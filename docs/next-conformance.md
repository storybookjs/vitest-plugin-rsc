# Next.js Conformance

`conformance/` runs a selection of Next's own e2e tests against `vitest-plugin-rsc/nextjs`: the ones in `test/e2e/app-dir` of [`vercel/next.js`](https://github.com/vercel/next.js). Each of them is an app with tests of how Next runs it. So the share that passes says how close the plugin is to Next, and the rest is a list of what is different, each test with why.

It is not a part of `pnpm test`. It fetches from GitHub, and a run takes minutes.

## Results

<!-- conformance:results:start -->

Measured against `next@16.4.0`, with `pnpm conformance --docs`.

|                                                     |         Tests |
| --------------------------------------------------- | ------------: |
| Run                                                 |           522 |
| **Pass**                                            | **399** (76%) |
| Fail: a bug in the plugin                           |             4 |
| Fail: Not Yet                                       |            71 |
| Fail: not applicable                                |            48 |
| Skipped by the test itself, for a run like this one |             4 |

Of the 474 tests that apply, 399 pass: **84%**.

### Per Fixture

| Fixture                                           |     Pass | Bug | Not Yet | N/A | Skipped |
| ------------------------------------------------- | -------: | --: | ------: | --: | ------: |
| **Pages and rendering**                           |          |     |         |     |         |
| `hello-world`                                     |   4 of 4 |     |         |     |         |
| **Navigation**                                    |          |     |         |     |         |
| `navigation`                                      | 39 of 53 |     |      10 |   4 |         |
| `shallow-routing`                                 | 16 of 17 |   1 |         |     |         |
| `hooks`                                           | 19 of 27 |     |       8 |     |         |
| `use-params`                                      |   6 of 7 |     |       1 |     |         |
| **Server Actions**                                |          |     |         |     |         |
| `actions`                                         | 58 of 87 |   1 |       8 |  20 |       3 |
| `actions-navigation`                              |   2 of 2 |     |         |     |         |
| `actions-revalidate-remount`                      |   1 of 1 |     |         |     |         |
| `actions-unrecognized`                            | 14 of 20 |     |       4 |   2 |         |
| `server-actions-relative-redirect`                |   5 of 5 |     |         |     |         |
| **Route handlers**                                |          |     |         |     |         |
| `app-simple-routes`                               |   2 of 2 |     |         |     |         |
| `app-routes`                                      | 59 of 67 |     |         |   8 |       1 |
| **Parallel routes**                               |          |     |         |     |         |
| `parallel-routes-layouts`                         |   1 of 1 |     |         |     |         |
| `parallel-routes-catchall`                        |   4 of 4 |     |         |     |         |
| `parallel-routes-breadcrumbs`                     |   4 of 4 |     |         |     |         |
| `parallel-routes-not-found`                       |   2 of 2 |     |         |     |         |
| **not-found and error boundaries**                |          |     |         |     |         |
| `not-found-default`                               |   7 of 7 |     |         |     |         |
| `error-boundary-navigation`                       |   6 of 7 |   1 |         |     |         |
| `global-error/basic`                              |  6 of 10 |     |       4 |     |         |
| `errors`                                          |  9 of 16 |     |       7 |     |         |
| **Metadata**                                      |          |     |         |     |         |
| `metadata`                                        | 35 of 49 |     |      12 |   2 |         |
| `metadata-navigation`                             |   7 of 7 |     |         |     |         |
| **next/font**                                     |          |     |         |     |         |
| `next-font`                                       | 10 of 16 |     |       6 |     |         |
| **next/image**                                    |          |     |         |     |         |
| `next-image`                                      | 10 of 11 |     |         |   1 |         |
| **CSS**                                           |          |     |         |     |         |
| `app-css-pageextensions`                          |   0 of 1 |     |         |   1 |         |
| `app-inline-css`                                  |   6 of 6 |     |         |     |         |
| `autoscroll-with-css-modules`                     |   2 of 2 |     |         |     |         |
| `css-bom`                                         |   1 of 2 |     |         |   1 |         |
| `css-chunking`                                    |   1 of 1 |     |         |     |         |
| `css-client-side-nav-parallel-routes`             |   1 of 1 |     |         |     |         |
| `css-media-query`                                 |   2 of 2 |     |         |     |         |
| `css-modules-pure-no-check`                       |   1 of 2 |     |         |   1 |         |
| `css-modules-scoping`                             |   2 of 2 |     |         |     |         |
| `css-server-chunks`                               |   0 of 1 |     |       1 |     |         |
| `cssnano-colormin`                                |   1 of 1 |     |         |     |         |
| `dynamic-css`                                     |   4 of 5 |     |       1 |     |         |
| `experimental-lightningcss-features`              |   0 of 3 |     |         |   3 |         |
| `initial-css-not-found`                           |   1 of 1 |     |         |     |         |
| `initial-css-order`                               |   2 of 2 |     |         |     |         |
| `next-dynamic-css`                                |   4 of 4 |     |         |     |         |
| `parallel-routes-css`                             |   1 of 1 |     |         |     |         |
| `random-in-sass`                                  |   0 of 1 |     |         |   1 |         |
| **The Data Cache**                                |          |     |         |     |         |
| `revalidate-dynamic`                              |   2 of 3 |     |         |   1 |         |
| `revalidatetag-rsc`                               |   3 of 3 |     |         |     |         |
| `unstable-rethrow`                                |   3 of 4 |     |         |   1 |         |
| **The proxy, rewrites, redirects, trailingSlash** |          |     |         |     |         |
| `app-middleware`                                  | 13 of 22 |   1 |       7 |   1 |         |
| `rewrites-redirects`                              | 14 of 14 |     |         |     |         |
| `trailingslash`                                   |   6 of 8 |     |       2 |     |         |
| `app-routes-trailing-slash`                       |   2 of 2 |     |         |     |         |
| `redirect-rewrite-dynamic`                        |   1 of 2 |     |         |   1 |         |

### A Bug In The Plugin: 4 Tests

<details><summary>2 × A page that the app loads itself, like a link to a path that is no route, replaces the entry of the history where a browser adds one. `back()` does not return to the page before it.</summary>

- `shallow-routing`: shallow-routing › back and forward › mpa navigation › should support setting data and then still support navigating back and forward
- `error-boundary-navigation`: app dir - not found navigation › should allow navigating to a non-existent page

</details>

<details><summary>1 × A form without a Server Action that the browser posts to `/` ends at `/?sessionId=…`: the page gets the query of the test's tab.</summary>

- `actions`: app-dir action handling › should not log errors for non-action form POSTs

</details>

<details><summary>1 × A proxy that answers itself with a `Location` header and a status that is no redirect gets the not-found page. `responseToMiddlewareResult()` of `@next/routing` does not say that the proxy answered, so the request goes on to a route.</summary>

- `app-middleware`: app-dir with middleware › should not incorrectly treat a Location header as a rewrite

</details>

### Not Yet: 71 Tests

<details><summary>21 × A page or an API route of the Pages Router. The plugin runs the routes of `app/`.</summary>

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
- `metadata`: app dir - metadata › should not effect metadata images convention like files under pages directory
- `css-server-chunks`: css-server-chunks › should not write CSS chunks for the server
- `app-middleware`: app-dir with middleware › Mutate request headers for Serverless Functions › Adds new headers
- `app-middleware`: app-dir with middleware › Mutate request headers for Serverless Functions › Deletes headers
- `app-middleware`: app-dir with middleware › Mutate request headers for Serverless Functions › Updates headers
- `app-middleware`: app-dir with middleware › Mutate request headers for Edge Functions › Adds new headers
- `app-middleware`: app-dir with middleware › Mutate request headers for Edge Functions › Deletes headers
- `app-middleware`: app-dir with middleware › Mutate request headers for Edge Functions › Updates headers

</details>

<details><summary>16 × A production build of React. The plugin runs React's development build: an error of the server reaches the client with its message, where production sends a digest and a minified message, and Strict Mode runs an effect twice.</summary>

- `navigation`: app dir - navigation › query string › useParams identity between renders › should be stable in app
- `actions`: app-dir action handling › should report errors with bad inputs correctly
- `actions`: app-dir action handling › should error if server action arguments list is too long
- `actions`: app-dir action handling › should support hoc auth wrappers
- `actions`: app-dir action handling › Edge SSR › should return error response for hoc auth wrappers in edge runtime
- `global-error__basic`: app dir - global-error › should render global error for error in server components
- `global-error__basic`: app dir - global-error › should render global error when undefined is thrown in a server component
- `global-error__basic`: app dir - global-error › should render global error when null is thrown in a server component
- `global-error__basic`: app dir - global-error › should catch metadata error in global-error if no error boundary is presented
- `errors`: app-dir - errors › error component › should trigger error component when an error happens during server components rendering
- `errors`: app-dir - errors › error component › should preserve custom digests
- `errors`: app-dir - errors › error component › should trigger error component when undefined is thrown during server components rendering
- `errors`: app-dir - errors › error component › should trigger error component when null is thrown during server components rendering
- `errors`: app-dir - errors › error component › should trigger error component when a string is thrown during server components rendering
- `errors`: app-dir - errors › error component › should display error digest for error in server component with default error boundary
- `errors`: app-dir - errors › error component › retry › should recover Server Component error after retry

</details>

<details><summary>11 × Metadata files: `favicon.ico`, `icon.png`, `opengraph-image`, `sitemap.ts`, `robots.txt`, `manifest.webmanifest`.</summary>

- `metadata`: app dir - metadata › opengraph › should pick up opengraph-image and twitter-image as static metadata files
- `metadata`: app dir - metadata › opengraph › should override file based images when opengraph-image and twitter-image specify images property
- `metadata`: app dir - metadata › icons › should support basic complex descriptor icons field
- `metadata`: app dir - metadata › icons › should support root level of favicon.ico
- `metadata`: app dir - metadata › file based icons › should render icon and apple touch icon meta if their images are specified
- `metadata`: app dir - metadata › file based icons › should not render if image file is not specified
- `metadata`: app dir - metadata › static routes › should have /favicon.ico as route
- `metadata`: app dir - metadata › static routes › should have icons as route
- `metadata`: app dir - metadata › static routes › should support root dir robots.txt
- `metadata`: app dir - metadata › static routes › should support sitemap.xml under every routes
- `metadata`: app dir - metadata › static routes › should support static manifest.webmanifest

</details>

<details><summary>6 × The `<link rel="preload">` and `<link rel="preconnect">` of `next/font`, which Next takes from a manifest of its build.</summary>

- `next-font`: app dir - next/font › app dir - next-font › preload › should preload correctly with server components
- `next-font`: app dir - next/font › app dir - next-font › preconnect › should add preconnect when preloading is disabled in page
- `next-font`: app dir - next/font › app dir - next-font › preconnect › should add preconnect when preloading is disabled in layout
- `next-font`: app dir - next/font › app dir - next-font › preconnect › should add preconnect when preloading is disabled in component
- `next-font`: app dir - next/font › app dir - next-font › preconnect › should add preconnect when preloading is disabled in template
- `next-font`: app dir - next/font › app dir - next-font › navigation › should not have duplicate preload tags on navigation

</details>

<details><summary>5 × A redirect or a navigation to another origin. The tab cannot leave the test.</summary>

- `navigation`: app dir - navigation › redirect › components › should redirect to external url
- `navigation`: app dir - navigation › redirect › components › should redirect to external url, initiating only once
- `navigation`: app dir - navigation › external push › should push external url without affecting hooks
- `actions`: app-dir action handling › Edge SSR › should handle calls to redirect() with external URLs
- `actions`: app-dir action handling › fetch actions › should handle calls to redirect() with external URLs

</details>

<details><summary>4 × A form without JavaScript for a Server Action that is not there, which names it in a `$ACTION_ID_` field. The server answers 409 for an id that cannot be one, where Next answers 400, and logs Next's error without the id.</summary>

- `actions-unrecognized`: unrecognized server actions › should error and log a warning when submitting a server action with an unrecognized ID - nodejs › should reject an MPA action with a malformed ID
- `actions-unrecognized`: unrecognized server actions › should error and log a warning when submitting a server action with an unrecognized ID - nodejs › should reject an MPA action with a plausible but missing ID
- `actions-unrecognized`: unrecognized server actions › should error and log a warning when submitting a server action with an unrecognized ID - edge › should reject an MPA action with a malformed ID
- `actions-unrecognized`: unrecognized server actions › should error and log a warning when submitting a server action with an unrecognized ID - edge › should reject an MPA action with a plausible but missing ID

</details>

<details><summary>2 × A page that a build prerenders, like one with `generateStaticParams`. Next keeps it between two requests, and here every request renders its page.</summary>

- `trailingslash`: app-dir trailingSlash handling › should revalidate a page with generated static params (withSlash=true)
- `trailingslash`: app-dir trailingSlash handling › should revalidate a page with generated static params (withSlash=false)

</details>

<details><summary>2 × Server code that imports a builtin module of Node.js that has no stand-in here, like `node:timers/promises`.</summary>

- `navigation`: app dir - navigation › navigating to a page with async metadata › shows a fallback when prefetch was pending
- `navigation`: app dir - navigation › navigating to a page with async metadata › shows a fallback when prefetch completed

</details>

<details><summary>1 × An `HttpOnly` cookie. The cookies of the server are the cookies of the tab, and a script of the page reads every one of them.</summary>

- `app-middleware`: app-dir with middleware › should respect cookie options of merged middleware cookies

</details>

<details><summary>1 × A form that the browser posts itself, not Next's router. The server does not look for the action in the form data.</summary>

- `actions`: app-dir action useActionState › should support hydrating the app from progressively enhanced form request

</details>

<details><summary>1 × A navigation while a Server Action is in flight. The server handles one request at a time.</summary>

- `actions`: app-dir action handling › should not block navigation events while a server action is in flight

</details>

<details><summary>1 × The CSS of a component of `next/dynamic`, which Next links from its manifest of dynamic imports, with `precedence="dynamic"`, next to a preload of its JavaScript. Here it is a stylesheet of the segment that imports the component.</summary>

- `dynamic-css`: app dir - dynamic css › should preload all chunks of dynamic component during SSR

</details>

### Not Applicable: 48 Tests

<details><summary>12 × Reads the output of `next build`: a manifest, a chunk or a prerendered file in `.next`.</summary>

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
- `metadata`: app dir - metadata › static routes › should build favicon.ico as a custom route
- `metadata`: app dir - metadata › static optimization › should build static files into static route

</details>

<details><summary>10 × Opens the page with JavaScript off. The test runs in the tab of the page.</summary>

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

<details><summary>5 × Uses Playwright's `Page` itself: `page.route()` to stand in for a response, or an event of a frame.</summary>

- `actions`: app-dir action handling › should propagate errors from a `text/plain` response to an error boundary
- `actions`: app-dir action handling › should trigger an error boundary for action responses with an invalid content-type
- `actions`: app-dir action handling › should be possible to catch network errors
- `actions`: app-dir action handling › fetch actions › should handle redirects to routes that provide an invalid RSC response
- `redirect-rewrite-dynamic`: redirect to a rewritten dynamic route (#95195) › client-side navigation to /a should update the URL to /

</details>

<details><summary>5 × The app needs an npm package that its test installs, and the runner does not: Sass, Lightning CSS, a CSS framework.</summary>

- `app-css-pageextensions`: app dir - css with pageextensions › css support with pageextensions › page in app directory with pageextention, css should work › should support global css inside layout
- `experimental-lightningcss-features`: experimental-lightningcss-features › include › should transpile light-dark() when included in lightningCssFeatures
- `experimental-lightningcss-features`: experimental-lightningcss-features › custom-media-queries › should substitute @custom-media when custom-media-queries is included
- `experimental-lightningcss-features`: experimental-lightningcss-features › exclude › should preserve light-dark() when excluded from lightningCssFeatures
- `random-in-sass`: random-in-sass › should work using browser

</details>

<details><summary>3 × Reads what the Next.js CLI prints: the table of routes of a build, or a warning when it starts.</summary>

- `revalidate-dynamic`: app-dir revalidate-dynamic › should correctly mark a route handler that uses revalidateTag as dynamic
- `unstable-rethrow`: unstable-rethrow › should correctly mark the dynamic page as dynamic
- `app-middleware`: app-dir with middleware › should warn when deprecated middleware file is used

</details>

<details><summary>2 × The test itself needs Node.js: it starts a server, or removes a directory.</summary>

- `next-image`: app dir - next-image › ssr content › should handle HEAD requests for uncached images
- `css-bom`: app dir - css with a UTF-8 BOM › keeps the BOM in the fixture

</details>

<details><summary>2 × Expects the `history.length` of a new tab. The tests of a file share the history of the tab, which ends at 50 entries.</summary>

- `navigation`: app dir - navigation › browser back after a push followed by a refresh › should load the previous page
- `actions`: app-dir action handling › should replace current route when redirecting with type set to replace

</details>

<details><summary>1 × Expects the cookie that an earlier test of the file set. The plugin's `cleanup()` clears the cookies after every test.</summary>

- `actions`: app-dir action handling › fetch actions › should revalidate when cookies.set is called in a client action

</details>

<details><summary>1 × Expects the CSS that Next's build minified. Here it is the CSS that Vite compiles, as it is.</summary>

- `css-modules-pure-no-check`: css-modules-pure-no-check › should have emitted a CSS file

</details>

<!-- conformance:results:end -->

## What The Results Say

Where the plugin runs something, it mostly runs it as Next does: 399 of the 403 tests that are neither a missing feature nor out of reach pass. What does not pass is, for nine tests out of ten, something the plugin does not do at all, or something a test in a browser cannot see.

**Bugs: 4 tests, 3 causes.** All are in the list above. One is about what a page leaves in the browser that a browser drops with the page: the history, which a page load replaces an entry of. One is a form that the browser posts to `/`, which gets the query of the test's page. One is about the server in front of the app: a proxy that answers with a `Location` header, which `@next/routing` reads as a proxy that let the request through.

**Not Yet: 71 tests.** The two largest causes are half of them:

- **The Pages Router**, 21 tests. Fixtures of the App Router have a `pages/` directory to test the two together: its pages, and its API routes.
- **React's development build**, 16 tests. A deployment sends the client a digest for an error of a Server Component, and the message is minified. Here the client gets the message, and Strict Mode runs an effect twice. That is `next dev` without its overlay, for errors, and `next start` for the rest.

Four causes are not in the "Not Yet" list of `docs/next-routes.md`: the Pages Router, the ids of Server Actions (4 tests), a builtin module of Node.js without a stand-in (2), and a prerendered page (2), which that document has under "The Node.js Runtime".

**Not applicable: 48 tests.** More than half of them are JavaScript off (10), the output of a build (12), and an npm package that the runner does not install (5).

**The server in front of the app.** Five fixtures are there for the proxy, the redirects and rewrites of `next.config`, and `trailingSlash`. 36 of their 48 tests pass. Of the 12 that do not, 6 ask for an API route of the Pages Router, 2 expect a prerendered page, 2 cannot run in a browser, 1 expects an `HttpOnly` cookie, and 1 is the bug above.

**CSS.** 18 fixtures are Next's own tests of CSS: global CSS and CSS modules, their order, client navigation, parallel routes, `next/dynamic`, inline CSS and the pure mode of a CSS module. 29 of their 38 tests pass, and none fails for a bug of the plugin. Of the 9 that do not, 5 need an npm package that the runner does not install (Sass, Lightning CSS, a CSS framework), 1 reads a file with Node.js, 1 expects CSS that Next's build minified, 1 asks for the Pages Router, and 1 expects the CSS of a component of `next/dynamic` from Next's manifest of dynamic imports. Seven more of Next's fixtures for CSS do not run here: five need a package or a feature that the runner does not have, two only Turbopack runs. `conformance/src/fixtures.ts` says which.

### Found Along The Way

What the list above does not have:

- **A pending refresh outlived its page.** Fixed with the runner: see "What Stands In For A Server" in `docs/next-routes.md`. Next sends a `<meta http-equiv="refresh">` with a `redirect()` in a response that had started. It came due a second later, in the page of the next test, or between two tests, where nothing stopped the tab from leaving and the rest of the test file did not run.
- **`history.back()` past the entry a page was opened in leaves the test.** The tab goes back to the test runner's own entry, and Vitest loses the tab.
- **The first run of an app can fail where the second passes.** With a cold cache, Vite finds `next/legacy/image` for the `ssr` layer while a test runs, and pre-bundles again. The page that asked for it gets a 404. Two tests of `next-image` fail that way on a fresh checkout, and pass from then on. The runner runs such a fixture again and says so.
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
| `nextTestSetup`, `next` (`e2e-utils`)                                 | `shim/e2e-utils.ts`, `shim/next-instance.ts`. `next.fetch()` is `handleRequest()`, `next.browser()` is `renderServer({ url })`                                                                                                 |
| The browser of `next.browser()`                                       | `shim/browser.ts`: Next's chainable wrapper of a Playwright page, written against the DOM. A selector is `document.querySelector`, `eval` is `eval`, and a click is the real one that Vitest's `userEvent` asks Playwright for |
| `retry`, `check`, `waitFor` and the other helpers (`next-test-utils`) | `shim/next-test-utils.ts`, with the bodies of Next's own                                                                                                                                                                       |
| `describe`, `it`, `expect`, `jest`                                    | Vitest's, with the matchers of `jest-extended`, which Next's Jest setup adds                                                                                                                                                   |
| `// @gate` and `// @force-gate` pragmas                               | `shim/gate.ts`: Next's own rule for a test that only holds in some runs                                                                                                                                                        |
| `path`, `cheerio`, `stream`                                           | `pathe`, cheerio, and a `Readable` that `next.fetch()` sends as a stream                                                                                                                                                       |
| `fs`, `http`, `playwright` and the like                               | A stand-in that can be imported and not called                                                                                                                                                                                 |

What a test asks for that a tab cannot give, the shim throws as `Unsupported`, with what it was. The runner reports such a test as not applicable, with that reason.

The 32 fixtures have 34 test files, 9100 lines. They use 17 members of `next`, 29 methods of the browser and 15 helpers of `next-test-utils`. Of `next`, 13 work and 4 are refused with a reason: `patchFile`, `renameFile` and `deleteFile`, which change a file of the app, and `getPrerenderFilePath`. All 29 of those methods of the browser work. Of the helpers, 12 work; refused are the two that read the dev overlay, and `listClientChunks`, which reads a build.

### The Fixtures Come From Next's Repository

The tests are not in the `next` package. The runner fetches them from `vercel/next.js` at the tag of the installed `next`, into `conformance/.next-repo`, which git ignores: a shallow, blobless, sparse clone of `test/lib` and of the directories in `conformance/src/fixtures.ts`. That is 12 MB for the 32 fixtures. The whole repository is gigabytes.

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

It is not quite `next start`: React is a development build here. See the results for what that means for a test.

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
- **`/_next/` goes to the dev server.** `next.fetch()` is `handleRequest()`, which reaches the routes of the app. Fonts, images and Next's image optimizer are the dev server's here, so those requests are the tab's `fetch`.
- **A moment for React.** A call of Playwright is a round trip, and React has rendered what was scheduled by the time it arrives. The shim waits a tick before each call.
- **A second run.** A fixture whose run is not what the expectations say runs again, and the second run counts. That takes a cold cache and a busy machine out of the results, and it would take a test that fails one time in two out of them as well. The run names every test that ended otherwise the second time.

## Adding A Fixture

Add it to `conformance/src/fixtures.ts`, run `pnpm conformance <id> --update`, and give each new failure in `expectations.json` a reason. A reason is worth the look: the same message can be a bug in the plugin in one test and a missing feature in the next. `--grep` and `--print`, which shows what the page and the server log, help with one test.

A fixture whose test passes `nextConfig`, `buildArgs` or `overrideFiles` to `nextTestSetup()` asks Next to change the app before it builds. The runner cannot do that when the test asks, so those tests are not applicable, unless the fixture says what to do to the copy instead: see `prepared` of `trailingslash`. A test file that starts two apps cannot run at all.
