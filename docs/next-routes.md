# Next.js: How It Works

`vitest-plugin-rsc/nextjs/testing-library`, with the plugin from `vitest-plugin-rsc/nextjs/plugin`, runs a Next.js App Router app in the test's browser tab: the server that answers a request, the HTML it renders, and the client that hydrates it. This page explains how, and what it does not do yet. The [README](../README.md#nextjs) shows how to use it.

It needs `next@16.4` or later. That is where Next's request stores became one per realm, which is what lets the three layers below run as separate module graphs.

## The Idea: Port The Build, Run The Runtime

Next.js is two things. A build, written for webpack and Turbopack, that turns `app/` into bundles. And a runtime, in `next/dist`, that those bundles run on: the request handler, the renderer, the router, the caches.

Only the build is tied to a bundler. So this plugin does the build with Vite, and asks Next's own build code for everything that is not bundling:

| What                                         | Where it comes from                                               |
| -------------------------------------------- | ----------------------------------------------------------------- |
| The routes of the app                        | `next/dist/build/route-discovery`, `normalizeCatchAllRoutes()`    |
| A route's loader tree: page, layouts, errors | `next-app-loader`, Next's webpack loader, called as-is            |
| A page's request handler                     | `next/dist/build/templates/edge-ssr-app`, expanded by Next        |
| A route handler's route module               | `next-app-loader` again, which expands `templates/app-route`      |
| A route handler's request handler            | `next/dist/build/templates/edge-app-route`, expanded by Next      |
| Compile-time constants                       | `getDefineEnv()`                                                  |
| Module aliases, per layer                    | `createWebpackAliases()` and the other alias tables               |
| React                                        | The React that Next ships, through `createVendoredReactAliases()` |
| The compile of a source file of the app      | Next's SWC transform, with `getLoaderSWCOptions()` for its layer  |
| A call of a `next/font` function             | `next-font-loader` and Next's `css-loader`, called as-is          |
| An imported image                            | `next-image-loader`, called as-is                                 |
| An image behind `/_next/image`               | Next's image optimizer, `next/dist/server/image-optimizer`        |

Everything behind those is Next's runtime, unchanged: `handler(Request)` returns the `Response` a deployment would send.

The routes are listed the way `next build` lists its entries. The pages with the same pathname are one route, a catch-all page in a slot is added to the routes it also matches, and an app whose routes `next build` rejects is rejected here, with Next's own errors: pages no route matches, slots that cannot render the same URLs, and, with `strictRouteMatching`, an interception route without the route it intercepts. The loader gets the options a build passes, so a layout of slots only has no `children`, as in a deployment.

### When Next Changes

All of this is internal to Next, and it changes between minor versions. The output of the build code names the runtime it was made for: the constants the runtime reads, the files an alias leads to, the arguments a template passes. So the plugin does not bring a copy of Next's build code. It calls the one of the installed `next`, from one file, `project.ts`, which is typed against Next's own declarations.

That file checks what the plugin relies on when a run starts, or for a loader when it is first used: of the build code, and of the runtime that the plugin's own modules call in the tab. Of the runtime it checks what would fail silently, or without saying why: a hook, a global, `document.currentScript`, what the shim of `server-reference-info` replaces, the manifests. A static import of a name that is gone needs no check: the module fails to link, with a `SyntaxError` that names it. The files of the runtime are only read for it, not loaded: they run in the tab. A Next.js that differs stops the run with one message: the version, and what is different.

| What is checked                                                                                                           | Without the check                                                       |
| ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Every file and export of the build code that is called                                                                    | A `TypeError` somewhere in the plugin                                   |
| `discoverRoutes()` returns `mappedAppPages`                                                                               | An app without routes: every URL is a 404                               |
| `getDefineEnv()` sets `process.env.NEXT_RUNTIME` to `edge` for the server layers                                          | Next's modules load their Node.js builds in the tab                     |
| The alias tables have `react-server-dom-webpack/server$`                                                                  | A `TypeError` on a path                                                 |
| `IncrementalCache` takes `fs`, `serverDistDir` and `fetchCacheKeyPrefix`                                                  | Nothing is cached, or a test finds another's entries                    |
| The SWC transform turns a call of a `next/font` function into an import of `next/font/.../target.css?`                    | A font function that throws, without a message                          |
| The SWC transform marks a `"use client"` module of the `rsc` layer                                                        | A client module that asks for the `require` of Next's bundler           |
| `getNextFontLoader()` uses css-loader and next-font-loader, and css-loader makes a list of CSS with `locals`              | A font without CSS, or without class names                              |
| `next-image-loader` makes a module that starts with `export default {`                                                    | An imported image that is not what `next/image` takes                   |
| The app loader's output has `__webpack_require__` and imports `app-page-runtime`                                          | Next's Node.js request handler loads in the tab                         |
| The `app-route` template loads `route.ts` with `userland: () => require(`                                                 | A `require` that the tab does not have                                  |
| The `edge-ssr-app` template imports the page as `pageMod`                                                                 | An import of a module that does not exist                               |
| The client entry has `hydrate()`, which the plugin imports once the page is there                                         | A `TypeError` when a page loads                                         |
| Next's root component calls `__NEXT_HYDRATED_CB` under `process.env.__NEXT_TEST_MODE`                                     | `renderServer()` waits for the page to hydrate until the test times out |
| Next takes its asset prefix from the `/_next/` URL of `document.currentScript`                                            | The app does not start in the tab                                       |
| `server-reference-info` has the functions the plugin replaces for Vite RSC's ids                                          | Next rejects the ids of Vite RSC's Server Actions                       |
| The edge route module reads the globals `self.__BUILD_MANIFEST`, `self.__SERVER_FILES_MANIFEST` and `self.__RSC_MANIFEST` | Manifests that Next does not read                                       |
| `setManifestsSingleton()` takes `page`, `clientReferenceManifest` and `serverActionsManifest`                             | Manifests that Next does not read                                       |

Apart from the options of `setManifestsSingleton()`, a function that is still there but takes other arguments is not checked: a function of the build code fails with its own error, at startup, one of the runtime when a test calls it. What it cannot check either is what Next's runtime does with all of that once a request comes in: a manifest field it starts to read, or a key it starts to require in the loader tree. That shows up as a failing test. CI runs both playgrounds against `next@latest` and `next@canary` for it.

The Flight codec that Next imports as `react-server-dom-webpack` is Vite RSC's in the `rsc` layer, through adapters that leave out Next's manifests. The layer has every export of Next's codec, as the installed `next` has it. One that the plugin has no adapter for throws when it is called, and says so; a new export that nothing calls does not stop a run.

## Three Layers, Three Environments

Next compiles an App Router app into three layers. Each has its own module graph and its own build of React:

| Layer     | Runs                                              | React                | Vite environment |
| --------- | ------------------------------------------------- | -------------------- | ---------------- |
| `rsc`     | Server Components, Server Actions, route handlers | `react-server` build | `client`         |
| `ssr`     | The request handler of a page, the HTML renderer  | regular build        | `next_ssr`       |
| `browser` | Next's router, your Client Components             | regular build        | `react_client`   |

Each layer is a Vite environment here, with the aliases and constants Next gives that layer. All three run in the test's tab. That is what keeps the test white-box: the `db` your test seeds is the module instance the Server Component reads.

Where Next's bundler config moves a module to another layer, the plugin does the same. The route module is created by the `rsc` layer but belongs to `ssr`. The route's request handler is in `ssr` and imports the page from `rsc`. Client Components load once for `ssr`, to render HTML, and once for `browser`. A route handler is `rsc` as a whole: its `route.ts`, its route module and its request handler.

## The Compiler

Before Next bundles a source file of the app, it compiles it: with its SWC transform, and with webpack loaders for fonts and images. The plugin runs those for the source files of the app, in each of the three layers, with the options Next's build gives that layer. Next's transform takes the types out of TypeScript, as in Next's build. JSX is still Vite's to compile, and so is CSS. JSX in a `.js` file, which Vite does not take, is compiled by Next's transform too.

| What Next's build does                                                                                                                           | Here                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| The checks of what a layer may do: a client hook in a Server Component, `server-only` in a Client Component, `metadata` in a `"use client"` page | Next's SWC transform. The module throws Next's error when it loads, see below                                                               |
| `next/font/google` and `next/font/local`, also when a package calls them, like `geist`                                                           | Next's SWC transform and font loaders                                                                                                       |
| `import logo from "./logo.png"`, also an SVG                                                                                                     | Next's image loader: `{ src, width, height, blurDataURL }`                                                                                  |
| `next/image`                                                                                                                                     | Next's runtime, and Next's image optimizer behind `/_next/image`                                                                            |
| `next/dynamic`, also with `ssr: false`                                                                                                           | Next's SWC transform, which leaves the import out of the server's code. `next/dynamic` also works without it                                |
| styled-jsx                                                                                                                                       | Next's SWC transform, with the `styled-jsx` that Next depends on                                                                            |
| `compiler` of `next.config`: `removeConsole`, `reactRemoveProperties`, `styledComponents`, `relay`, and `experimental.swcPlugins`                | Passed to Next's SWC transform. Only `removeConsole` is tested                                                                              |
| `"use client"`, `"use server"`                                                                                                                   | Vite RSC                                                                                                                                    |
| `typeof window` in server code                                                                                                                   | A define, see [Server Code In A Tab](#server-code-in-a-tab)                                                                                 |
| `server-only`, `client-only`                                                                                                                     | Next's SWC transform stops at the wrong one in a source file. In a package, Next's aliases make it a module that throws. That is not tested |
| The `paths` of `tsconfig.json`                                                                                                                   | Vite's `resolve.tsconfigPaths`, which the plugin turns on unless your config sets it                                                        |
| Global CSS, CSS modules, PostCSS                                                                                                                 | Vite's. A class name of a CSS module is not the one Next makes                                                                              |
| `next/script`                                                                                                                                    | Next's runtime, nothing to compile                                                                                                          |

**Fonts.** A call like `Inter({ subsets: ["latin"] })` becomes an import of the font's CSS, which Next's font loader writes: the `@font-face` rules, a fallback font with adjusted metrics, and the class names that the call returns. The font files are served under `/_next/static/media/`, where the CSS says they are. `next/font/google` downloads a font from Google Fonts when a run first loads it, as `next dev` does, and without a network it sets the fallback font and logs the error of the download. That is not tested. To keep a test run off the network, set `NEXT_FONT_GOOGLE_MOCKED_RESPONSES` to a file with the answers of Google Fonts, which is how Next tests `next/font/google` itself: see `vitest.google-fonts.cjs` in this repository.

**Images.** An imported image is the object `next/image` takes, with the file under `/_next/static/media/`. `/_next/image` is answered by Next's image optimizer in the Vitest process, as `next start` answers it, with the `images` of `next.config`, like `remotePatterns`. It keeps no cache, and tells the browser not to keep the image either. It needs `sharp`, which Next installs as an optional dependency. An image of another server is downloaded when the tab asks for it.

**Build errors.** What `next build` stops at, the plugin finds when a test loads the module, since nothing is built up front. The module then throws Next's error, as a module does in webpack's development build. In the `rsc` layer that fails the request, so `renderServer()` rejects with the error. In a Client Component it fails the render on the server and in the browser: Next shows its error page, and the error is logged and reported as uncaught, which fails the test run. A module that only a test imports is a module of the `rsc` layer too: one that calls a client hook without `"use client"` throws when the test imports it, unless it is in `browserModules`.

A source file of the app is every JavaScript or TypeScript file that Vite serves and that is not in `node_modules`. A package is pre-bundled as it is, except for a file of it that names `next/font`: that one goes through Next's transform, as in Next's build, for a package like `geist`. In the `rsc` layer, which shares its environment with the test, the test files, setup files and `browserModules` are not compiled: see [Server Code In A Tab](#server-code-in-a-tab).

What Next's build does that the plugin does not, is under [Not Yet](#not-yet).

## A Request

```
renderServer({ url: "/notes/1" })
  │  GET /notes/1                          the browser's fetch, with its cookies
  ▼
ssr      handler(Request)                  Next's edge entry for the route
  │        └─ app-render
  ▼
rsc      Server Components → Flight        your page, layouts, data
  │
  ▼
ssr      Flight → HTML                     Next's own stream, with the Flight payload inlined
  │  200 text/html
  ▼
browser  the HTML goes into the document   once all of it has arrived
         Next's client entry hydrates it   in a module graph of its own, like a page load
```

After that, Next's router is in charge. A `<Link>` navigation is an RSC request to the same handler. A Server Action is a `POST` with a `Next-Action` header.

## A Component

`renderServer(<Node />, { url })` renders one node the way Testing Library renders a component: in a `<div>` in `document.body`, without the layouts of the app. It is not a second renderer. The node is the page of a route, and the request for it is the one above.

```
renderServer(<Node />, { url: "/notes/7" })
  │  GET /notes/7                          the same request, with the tab's cookies
  ▼
ssr      handler(Request)                  the same edge-ssr-app handler, for the route of the node
  ▼
rsc      loader tree → Flight              a tree with the node as its page, and no layout
  ▼
ssr      Flight → HTML                     no <html> or <body>: nothing in the tree renders them
  ▼
browser  the HTML goes into the container  with Next's inline scripts, which run
         Next's client entry hydrates it   the container, where it would hydrate the document
```

### The Route Of A Node

The route exists for as long as the node is there, at the pathname of `url`. Its loader tree is written here and not by `next-app-loader`. That loader reads a directory of files, and it ends the process for a page without a root layout. Next's renderer needs no layout. The tree goes into Next's own `app-page` template, with the injections `next-app-loader` makes, and from there on the route is a page like any other: the same request handler, manifests, cookie jar and cache.

For `/notes/7`, where the app has `app/notes/[id]/page.tsx`:

```js
[
  "(vitest-plugin-rsc)",
  {
    children: [
      "notes",
      {
        children: [
          "[id]",
          { children: ["__PAGE__", {}, { page: [loadTheNode, "vitest-plugin-rsc/component"] }] },
          {},
          null,
        ],
      },
      {},
      null,
    ],
  },
  { "global-error": [() => import("next/dist/client/components/builtin/global-error.js"), "…"] },
  null,
];
```

- **The segments** are those of the app's route for the URL, so Next finds the same params. The plugin matches the URL against the routes of the app, as it does for every request. A URL of no route gets the tree of `/`, which has no params. A route handler's pathname has a tree too.
- **The page name** is the one of the pathname, like `/notes/[id]/page`. Next derives the tags of `revalidatePath()` from it.
- **No layout**, also not a pass-through one. So the HTML has no `<html>` or `<body>`, and it fits in a `<div>`.
- **Next's builtin boundaries** are the only other modules, at the root: `global-error`, which Next's renderer throws without, and `not-found`, `forbidden` and `unauthorized`. `next-app-loader` gives them to a root that has none of its own. They are Next's, not the app's.
- **The root segment is not `""`**, which is what the root of every tree of the app is. That is part of what makes leaving the node a page load, see below.

There is one such route for each pathname of the app, and one for `/`. They are in the same lists as the app's pages, and load when they are first requested.

### Next's Router In A `<div>`

Next's client entry, `app-index.js`, builds the app and calls `hydrateRoot(document, …)`. There is no option for another root. The plugin already wraps `ReactDOMClient.hydrateRoot` and `createRoot` for the duration of that call, to keep the root, which Next does not hand out. For a node, the same wrapper passes the container where Next passes `document`. Nothing else differs: Next's own `hydrate()` creates the router state from the Flight payload in the page and renders its own `AppRouter`. So `Link`, `useRouter()`, `usePathname()`, `useParams()`, `useSearchParams()`, `router.refresh()` and Server Actions are Next's. No router state is made up.

The server's HTML is a fragment: hoisted tags like `<meta>`, the node, and Next's inline scripts. The HTML parser puts the leading tags in `<head>`, where React looks for them. What it puts in `<body>` goes in the container, in the order it has: the node, with any `<script>` it renders itself, and Next's scripts after it, which run as for a page. The rest of the document stays the test's, so nothing is parked. The `<body>` is a new one for as long as the node is there, with what the test has in it: what the node leaves on the body, like the listeners React adds for a portal, goes with that body. That is why the container has to be empty, and cannot be `<body>`.

Not every response for a node is that fragment. Then the response loads as the page it is, in the document, and the container stays empty:

- A node that calls `redirect()` while it renders gets the page it redirects to. The node's route is gone.
- A node that throws, or calls `notFound()`, gets a whole document from Next, with `<html id="__next_error__">`: Next has no HTML for it and renders its global error page, or its not-found page, in the tab. Next's client entry does that with `createRoot(document)`, as for any page.

React listens for events on the root's container. For a node that is the `<div>`, not `document`. Only `selectionchange` is on the document. The plugin removes both when the node is left, as it does for a page: the container can be the test's, and outlive the node.

### Leaving The Node

A request is the node's when its pathname is the node's. A change of search params, `router.refresh()` and a Server Action stay with the node.

A navigation to another pathname gets the app's route for it. Next's router then walks the tree it has and the tree it gets, from the root (`render-tree.js`). It loads the page, instead of navigating on the client, when three things hold at a segment:

1. The two trees do not match there. For the root, Next compares the segments themselves (`doesRouteStructureMatch()`), and these differ: `(vitest-plugin-rsc)` and `""`.
2. The segment of the new tree is in its root layout or above it (`PrefetchHint.IsRootLayoutOrAbove`). The root of a tree of the app is.
3. `isNavigatingToNewRootLayout()` says the root layout is another one. It does, at the root already: the segments differ.

So the plugin's page load takes over, the same one a `location.assign()` gets. The node is unmounted, the document becomes the page's, and the node's route is gone.

This is how an app with two root layouts, in two route groups, moves between them. A node has no layout at all, so every segment of its tree counts as above the root layout, and no page of the app shares one with it.

A link to the node's own pathname stays with the node. With the default URL that is `/`: a `<Link href="/">` in a node does not load the app's home page.

A link in a node is not prefetched, and neither is one in a page. `NODE_ENV` is `"test"` in the tab. Next marks a link as visible only when `NODE_ENV` is `"production"` (`links.js`), and it prefetches no link that is not visible, also not on hover.

### What It Needs Of Next

Checked at startup, like the rest (see [When Next Changes](#when-next-changes)):

| What                                                                                                                                 | Without it                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| The `app-page` template takes `tree`, `__next_app_require__` and `__next_app_load_chunk__`                                           | No route for a node                                           |
| `next/dist/client/components/builtin/` has `global-error.js`, `not-found.js`, `forbidden.js` and `unauthorized.js`                   | No route for a node                                           |
| `app-index.js` has `const appElement = document`, and calls `hydrateRoot(appElement` and `createRoot(appElement`                     | The node hydrates the document, or nothing                    |
| `segment-cache/cache.js` compares the root segments of two trees                                                                     | A link from a node renders a page of the app in the container |
| `render-tree.js` calls `doesRouteStructureMatch(`, reads `PrefetchHint.IsRootLayoutOrAbove` and calls `isNavigatingToNewRootLayout(` | The same                                                      |

Not checked: the shape of a loader tree, `[segment, parallelRoutes, modules, staticSiblings]`. The tests of a node fail when it changes.

## Route Handlers

An `app/**/route.ts` is a route like a page is, with a request handler from another template:

```
handleRequest("/api/notes/1", { method: "PUT", body })     or fetch() in a Client Component
  │  PUT /api/notes/1                      with the tab's cookies
  ▼
rsc      handler(Request)                  Next's edge entry for the route handler
           └─ AppRouteRouteModule          Next's route module: the request stores, cookies(),
              └─ PUT(request, { params })  redirect(), notFound(), HEAD and OPTIONS, 405
  │  200 application/json                  Set-Cookie goes into the tab's cookies
  ▼
the caller gets the Response               its body as the handler writes it
```

There is no HTML to render, so the `ssr` layer has no part in it. The module that `route.ts` imports is the instance the test imports, and `vi.mock()` replaces it for both.

An edge function of Next does not match its own route. Whoever routes a request to it adds the params of the dynamic segments to the query of the URL, and Next's wrapper reads them from there. The plugin does what `next start` does for an edge function. So `GET /api/notes/1` reaches the handler with `params.id` set to `"1"` and with `?id=1` in `request.url`, as it would for a handler with `export const runtime = "edge"`.

Next's route module rethrows what a handler throws, and its edge entry does not catch it. The server in front of it does: like `next start`, the plugin logs the error with `console.error` and answers `500 Internal Server Error`.

What Next does for a request after it has responded, like the callbacks of `after()`, it hands to `waitUntil`. The request lasts until that work is done, so the callbacks read the stores of their own request, and the next request waits for it, for one second at most.

### Which Requests Are The App's

The origin of the app is also the origin of the Vite dev server, which serves the modules of the test and of the app. So the `fetch` of the tab has to choose. A same-origin request goes to the Next.js server when:

- its path matches a route of the app, a page or a route handler, by Next's own route list and matcher, or
- Next's router or a Server Action sent it, which mark their requests with a header.

Everything else goes to the network: Vite's modules, files in `public/`, a service worker.

## What Stands In For A Server

The server layers are written for an edge runtime, which is close to a browser: web streams, `fetch`, `crypto`. The plugin adds the rest of that platform:

- **`Request` and `Response`** that keep `Cookie` and `Set-Cookie`, which a browser drops from its own.
- **`fetch`**, so that Next patches the server's `fetch`, not the page's. Next does that from the `rsc` layer when it first renders, and both server layers call the result. Both reach the same network.
- **`AsyncLocalStorage`**. A browser cannot carry a store across `await`. Requests are handled one at a time, and the store a request entered first stays readable until the request ends. A store that Next enters for a part of a request, like the one of a cached function, lasts until that part first awaits: see [Caching](#caching).
- **`Buffer`**, **`process`**, and the Node modules an edge runtime has.

And for the browser side, a page load: the tab cannot navigate away from the test, so the server's document is moved into the test's document once all of it has arrived, its inline scripts are run in order, and the URL is set with the History API. So the document has loaded when Next's client starts, and the page's first load does not show a `loading.tsx` or a Suspense fallback: a navigation in the app does, see the README.

For a `redirect()` in a response that had started, Next sends a `<meta http-equiv="refresh">` for a browser without JavaScript, and its router loads the page it redirects to when it finds that tag. A browser drops a refresh that is still pending with the page. This document stays, so the plugin takes the `http-equiv` off the tag before it moves it in: the router still finds the tag, and nothing comes due a second later, in the page that is there by then.

Two things that a build knows and a request has to find out here:

- **Server Actions.** Next's build lists every action of the app. Here an action is the module and the export its id names (`<module>#<export>`), so for a `POST` with a `next-action` header the server looks whether that id names a Server Action, and lists only that one. An id that names none gets the response Next gives when it has no such action: `409`, with `x-nextjs-action-not-found`. Next answers an id that cannot be one of its own with `400`; that does not happen here, because an id here is not shaped like Next's. When the module of the action fails to load, that error is the response, a `500`.
- **Vite's client.** Vite imports `/@vite/client` into a module with CSS, with `import.meta.hot`, or with a dynamic import it cannot analyse, like the one that loads a Client Component by its id. The `ssr` and `browser` layers load through a module runner, and get the client the page already has. That is the work of `vitestPluginRSC()`, for every environment the page runs through a module runner (`src/vite-client.ts`). A copy of their own would open a websocket per page load, and not to the server of the page: a module in a runner has a file URL, so Vite's client falls back to the port the dev server was configured with. That is another server when the port was taken, as it is while a second Vitest run is active on the machine. That server refuses the copy, which then logs an error that it cannot connect. Or it reloads the tab: MSW's replacement of `WebSocket` reports `open` before there is a connection, so Vite's client takes the refusal for a server that went away, and reloads once that other server answers its ping.

Next loads `next.config.ts` itself. It compiles the file and runs the result as a module without a filename, so Node looks up a relative import of the config, like `./env.ts`, from the working directory. For `next build` that is the project; for Vitest it can be the root of a workspace. So the plugin makes the project the working directory of the process while Next loads the config, one project at a time.

## Caching

Next's Data Cache works. What `unstable_cache` computes is kept for the next request, and so is what a `fetch` gets with `cache: "force-cache"` or `next: { revalidate }`, with or without `next: { tags }`. A `fetch` for the same URL twice in one render is one request.

What invalidates it does what it does in a deployment: `revalidateTag()` and `revalidatePath()` from a Server Action or a route handler, `updateTag()` and `refresh()` from a Server Action, which is the only place Next allows those two.

An edge function of Next has no cache of its own. The server in front of it has one and shares it: `next start` makes an `IncrementalCache` for a request and hands it to the edge function through `globalThis.__incrementalCache`. The plugin does that too. The class is Next's, and so is the handler it picks, the one `next start` uses, which keeps the entries in memory. The options are the ones Next's server passes, without a disk to write to. It is one cache for the pages and the route handlers.

Of `next.config`, `experimental.fetchCacheKeyPrefix` and `cacheMaxMemorySize` apply. With `cacheMaxMemorySize: 0` nothing is cached here, where `next start` still has its disk. The plugin does not load a `cacheHandler` or `cacheHandlers` of your own.

Every test starts with an empty cache: `cleanup()` forgets the revalidated tags and gives the cache a new key prefix, so no test finds what an earlier one stored. That also goes for a cached function that was still running when its test ended and stores its result afterwards. A cached function that only starts after its test has ended stores its result for the next test.

Between requests there is a cache too, so a test can call a cached function itself and share what it computes with the page. Await it before the next request: a cached function that is still running when a request starts hands that request its cache scope.

Next tells an entry from a revalidation by their time in milliseconds, from `Date.now()`. With a clock that stands still, which `vi.useFakeTimers()` gives and `vi.setSystemTime()` on its own too, a tag that is revalidated in a later request than the one that stored the entry is not newer than the entry, so the entry stays. The age of an entry, for `revalidate`, is off by the difference with the real clock.

### A Cache Scope Ends At Its First `await`

While a cached function runs, Next keeps a store for it in `AsyncLocalStorage`. That store is how `cookies()` knows to throw inside `unstable_cache`, and how a `fetch` in it knows not to be cached on its own.

Node carries that store to the code after an `await` in the cached function, and to nothing else. A tab cannot tell the two apart: when code runs after an `await`, nothing says whether it belongs to the cached function or to a component next to it that is rendering in the meantime. So one of the two reads the wrong store. Here the cached function does: its store lasts for the synchronous part of the function, and after the first `await` it reads the store of the request. The other choice breaks pages that work: with the store kept until the function is done, a component that renders during a cache miss reads the cache's store, and its `cookies()` throws.

So inside a function cached with `unstable_cache`, after its first `await`:

- `cookies()` and `headers()` work. In a deployment they throw.
- A nested `unstable_cache` keeps its own result, and so does a `fetch` with `cache: "force-cache"` or `next: { revalidate }`. In a deployment both run again whenever the outer function does. Here, when the outer function runs again because its tag was revalidated, it can get the old result of the inner one.

Before the first `await` all of these are as in a deployment. For a cached function that has no cached function or cached `fetch` inside it, what a test sees is right: its value, whether it ran again, and what invalidates it.

The same rule decides what `redirect()` does in the render after a Server Action. Next leaves the store of the action for that render, and the plugin keeps it left for the rest of the request, so a `redirect()` in a component replaces the page, as in a deployment.

## Server Code In A Tab

A tab has a `window`, and a `fetch` that Next has not patched. A tab cannot lose its globals, but a module can be compiled not to see them, so that is what happens to the modules of a server layer: your JavaScript and TypeScript source files, and the dependencies Vite pre-bundles.

- `typeof window` is replaced by `"undefined"`. That is what `next build` does to the code it compiles for a server, and what libraries rely on to tell a server from a browser. The same goes for `typeof document`, `typeof location`, `typeof localStorage` and `typeof sessionStorage`, which a server answers that way without help.
- `fetch`, `Request` and `Response` are the server's, also when they are written `globalThis.fetch`. So a `fetch` in your server code is the one Next patches: two calls for the same URL in one render are one request. It is still a request the tab makes, so the browser's rules for one apply, like CORS.

Nothing else is replaced. Code that reads `window.innerWidth` without asking `typeof window` first throws on a server, and reads the tab's `window` here.

A Client Component is a module of two layers: it is told it has no `window` while Next renders it to HTML in `ssr`, and has one in `browser`.

The `rsc` layer shares its Vite environment with the test, and a test needs the tab. So in that environment these are not server code:

- the test files and setup files of your Vitest config: `test.include` and `test.setupFiles`,
- Vitest, Vite and the `@vitest/*` packages you have installed, and the packages those depend on,
- what you list in `browserModules`.

Everything else in that environment is server code, including a module that only a test imports and a file with in-source tests. A component that is defined in a test file is code of that test file, and sees the tab.

### `browserModules`

Code asks `typeof window` for one of two reasons, and they need opposite answers here.

- **Role.** Am I the server side of this app? `@t3-oss/env-core` asks, and only hands out a server variable if the answer is yes. `next-themes` asks, and reads no theme from storage on the server. The answer has to be: you are the server.
- **Capability.** Is there a DOM here that I can work on? Testing Library asks before it binds `screen` to `document.body`. The answer has to be the truth: you are in a browser. Unless the module also gets by without a DOM: PGlite asks to pick how it loads, is told it is not in a browser, and works all the same.

Nothing in the code says which of the two a module means. So every other module of the `rsc` environment gets the first answer, and `browserModules` lists the ones that need the second:

```ts
vitestPluginNext({
  // Glob patterns, relative to the project root. One for a package starts
  // with `**`: files are matched by their real path, which package managers
  // put elsewhere than in `node_modules/<name>` under the root.
  browserModules: ["test/**", "**/node_modules/@testing-library/**"],
});
```

When you need it, as far as this was tried:

- A source file that is not a test file or a setup file and that asks `typeof window` or `typeof document` before it works on the page. Without an entry it is told it is on a server. The demo has one in `test/`.
- A package that the tests use on the page and that asks the same first. `@testing-library/dom` is one: without an entry `screen.getByRole()` throws "For queries bound to document.body a global document has to be available".

When you do not:

- A helper or a package that touches `document` without asking first. Only `typeof` is replaced.
- The locators, `userEvent` and `expect.element` of `vitest/browser`, and the rest of Vitest.
- MSW. Vitest leaves it out of pre-bundling, so it is served as it is.
- PGlite, in memory and on IndexedDB. It is told that it is not in a browser, and works all the same.

A package that both the tests and the app use can only get one of the two answers. If it needs both, it cannot be used on both sides. And an entry does not help a package of the app that, told it is on a server, takes a path only Node.js has.

What this does not cover:

- Everything else a browser has: `navigator`, `self`, `history`, `XMLHttpRequest`, `HTMLElement`, `indexedDB`, `matchMedia`, `requestAnimationFrame`. A library that asks for one of those to tell a browser from a server still finds it.
- Code that looks a global up at runtime: `globalThis.window`, `self.window`, `"window" in globalThis`.
- Code that reads `window` without asking `typeof window` first. On a server that throws a `ReferenceError`. Here it reads the tab's.
- Files that are not JavaScript or TypeScript when Vite loads them, like `.vue` or `.mdx`, and modules that another plugin generates.
- Dependencies in files other than `.js`, `.mjs` and `.cjs`, and a dependency that is left out of pre-bundling with `optimizeDeps.exclude`: those are served as they are. Vitest leaves out `msw`.
- With `resolve.preserveSymlinks`, the packages of Vitest are not recognized.

## Mocks

`vi.mock()` replaces a module in the `rsc` layer, where the test runs: the module your Server Components and Server Actions import. The other two layers load their modules themselves, so a mock does not reach a Client Component.

The mocks of app modules go in a setup file. With `isolate: false` the test files of a tab share their modules, so a module is mocked for all of them or for none, and the file that loads it first decides. A setup file runs before every test file. A bare `vi.mock("./app/lib/weather.ts")` there is enough, and a test says what the mock does with `vi.mocked(getForecast).mockResolvedValue("sunny")`.

In browser mode, Vitest 5.0 has a bug here: it does not wait for the mocks of a setup file before it imports a test file, so a test file with no `vi.mock()` of its own gets the real module ([vitest-dev/vitest#11450](https://github.com/vitest-dev/vitest/issues/11450), fixed by [#11520](https://github.com/vitest-dev/vitest/pull/11520) but not released yet). Until a release has the fix, import the mocked module in the setup file after the `vi.mock()` call. This repository patches Vitest instead, see `patches/`.

## Watch Mode

Vitest finds the test files to run again in Vite's module graph: it walks from the file that changed to what imports it, up to the test files. A test that opens a route with `renderServer({ url })` does not import `page.tsx`. The plugin does, in one module that lists every route, and every test file ends up importing that module. So in the graph every test file imports every route, and an edit of one page would run them all.

The tab knows better, and says so: when the server in it loads the modules of a route, it calls a browser command of the plugin, and Vitest adds the test file that runs. Right before Vitest looks up the test files for a change, the plugin makes the graph say the same (`watch.ts`): the list no longer imports the modules of the routes, and a test file imports the ones of the routes it loaded. The lookup is still Vitest's, so a component deep in a page finds the test files of that page, and a module that a test file imports itself still finds that test file.

```
app/profile/page.tsx changes
  -> the module of the route /profile       imports it
  -> app/profile/page.test.tsx              loaded that route
```

- **The hook** is `watchTriggerPatterns` of Vitest's config, with a pattern for every file and a function that returns nothing: Vitest calls it for a file that changes, before its own lookup.
- **A layout** is in the modules of every route under it, so it runs the test files of all of them.
- **A route that no test file has loaded** runs nothing. Neither does a test file that has not run since Vitest started: what it loads is not known yet.
- **A test file that changes** is forgotten until it has run again.
- **Tailwind** has to be told apart: it registers every file it scans as a dependency of the stylesheet, and Vitest follows that too, so a save of any file runs every test file whose page has the stylesheet. `playground/nextjs-notes-demo/test/ignore-watched-only-modules.ts` takes those out with the same hook.
  `scripts/watch-probe.mjs` says which test files a change runs.

### `vitest --changed` And `vitest related`

These pick the test files of a change before anything has run, so the tab cannot say what they load. Vitest answers from the imports of each test file: it transforms the file in the `ssr` environment, follows the imports that are files of the project, and keeps the test files that reach a changed file. For an app of Next that fails twice. A test file does not import the page it opens. And the `ssr` environment is none of the three layers: it has no compiler of Next, so it cannot read a file of the app that needs one, like a `.js` file with JSX.

A run does know (`related.ts`). When a test file has passed, the files it depends on are in Vite's module graphs, and the plugin writes them down, each with a hash of what is in it, in `vitest-plugin-rsc/related-<project>.json` in Vite's cache directory:

- what the test file and the setup files import;
- what the routes it loaded import, and the modules of the Server Actions it called;
- in each layer, since a Client Component has its imports in the browser layer;
- the mock of a module, from the `__mocks__` directory next to it;
- what Next reads next to the `app` directory, and what those files import: `next.config`, `tsconfig.json`, `.env` files.

At the next lookup the plugin answers for a test file itself. It belongs to the change when one of its files is a changed one, or is no longer what it was when it was written down. That second part is for a cache that is older than the checkout: a page that got a new import in a commit without a run. For a test file that belongs, the plugin adds it to the list of changed files, which Vitest keeps a test file for. The test file itself is empty in the `ssr` environment during a lookup, so Vitest follows no import into a file it cannot read.

- **Never too few.** A test file that is not written down belongs to every change, also one outside the project. That is one that did not pass, one that ran in part (a name pattern, a line, a tag, a bail), and every test file of a checkout without the cache.
- **A file that comes to the `app` directory or goes**, or next to it, can change which route a URL gets and which layouts a route has, without a change to a file that is written down. Then nothing that is written down counts.
- **The `ssr` environment is only Vitest's lookup** for a project in browser mode: its own code and the global setup run in another one. Vitest's static parse of a test file reads it there too, and finds no tests in it during a lookup.
- **Not known:** a test that loads a route only some of the time, like one behind a condition on the date or one that is skipped while it runs. A file that is no module: one the app reads from disk, or one in `public/`. A file Tailwind scans is no dependency of a test, though a class in it adds to the stylesheet.
- **One lookup at a time.** Vite keeps the empty test file, and the plugin lets go of it when a run starts. Code that looks up twice without a run in between gets the first answer.

`scripts/related-probe.mjs` says which test files `vitest related` picks.

## Not Yet

- Metadata files like `icon.png` and `sitemap.ts`. Next's metadata loaders still have to be run. A run warns once when it starts about the metadata files of the app, apart from `favicon.ico`: a page renders without them, and their routes are not served.
- Next's compiler for a package in `node_modules`, apart from a file that names `next/font`. Next also compiles the packages of `transpilePackages`, and a package that uses `next/dynamic`. Here a package is pre-bundled as it is. Not tested.
- A font in a test file. Next's compiler does not run on the test files, so call `next/font` in a module of the app. An image that a test file imports is the object Next makes of it.
- A `webpack` function or `turbopack` rules in `next.config`: loaders of your own, like `@svgr/webpack` or `@next/mdx`. And a Babel config, which makes Next compile with Babel.
- `compiler.emotion`: Next's transform gets the option, but JSX is Vite's to compile, with its own import source, so the `css` prop needs `jsxImportSource` in your tsconfig. Not tested.
- The React Compiler, `reactCompiler` in `next.config`. Components run as they are written.
- The optimizations of a bundle: `optimizePackageImports`, `modularizeImports`, `experimental.optimizeServerReact`, the browser targets. They do not change what the app does.
- A CommonJS source file in the app, with `require` or `module.exports`. Vite serves source files as ES modules.
- The files of `.env`, `NEXT_PUBLIC_` variables and `env` of `next.config`. `process.env` in the tab is empty unless a test or a setup file fills it.
- The font preloads: Next puts a `<link rel="preload">` in the HTML for the fonts of a route, from a manifest of its build. The fonts load when the CSS asks for them.
- Sass needs the `sass` package, as it does for Vite, and `sassOptions` of `next.config` does not apply. Not tested.
- An asset prefix with an origin of its own, like a CDN: the files of fonts and images are only served by the dev server.
- `middleware.ts` / `proxy.ts`, and the redirects, rewrites and headers of `next.config`.
- `trailingSlash`. A URL with a trailing slash, like `/notes/7/`, is served as it is, for a page and for a node. A deployment redirects it to `/notes/7`, or the other way around with `trailingSlash: true`: that redirect is one of Next's config routes.
- Route handlers run as they do on Next's edge runtime, also the ones a deployment runs on Node.js. The params of the dynamic segments are in the query of `request.url` too, where they replace a query parameter of the same name. Static generation of a `GET` handler and `revalidate` do not apply: every request runs the handler.
- `"use cache"`. Next compiles such a function with the part of its SWC transform that also compiles Server Actions, which is Vite RSC's here. And it would not be enough: the function is called after Next has awaited, so it would never read the store of its cache scope. `cacheTag()` and `cacheLife()` need that store, and so does collecting the tags of the `fetch` calls in it. See [Caching](#a-cache-scope-ends-at-its-first-await).
- Inside a function cached with `unstable_cache`, after its first `await`, the request's store is read instead of the cache's. See [Caching](#a-cache-scope-ends-at-its-first-await).
- A `cacheHandler` or `cacheHandlers` of `next.config`. The cache is Next's own, in memory.
- Code that leaves a store with `AsyncLocalStorage.exit()` for work that awaits, and reads the store again after it: the store stays left for the rest of the request. Next does this for the render after a Server Action, where nothing reads it again.
- An `after()` callback that takes longer than a second goes on without the stores of its request, so `cookies()` and `headers()` fail in it from then on. Under `vi.useFakeTimers()` a response without a body never tells Next it was sent, so its `after()` callbacks do not run while the request lasts, and the next request starts a second late.
- A navigation without Next's router to a route handler that does not answer with HTML, like a download link, is an uncaught error: there is nothing for the tab to show. So is a navigation to another origin, like a redirect to a sign-in or a checkout: the tab stays where it is.
- Server code is only told it is on a server where it asks `typeof window`: see [Server Code In A Tab](#server-code-in-a-tab).
- A mock for Client Components: see [Mocks](#mocks).
- One request at a time. A request that waits for another one that the test has not sent yet will wait forever. A response that streams without end, like server-sent events, holds up every request after it.
- A page that the test leaves before the server has sent anything, because the page waits for data outside a Suspense boundary, is not stopped. Its render goes on once the data comes, without its request, and Next logs the errors that follow, maybe in a later test.
- A same-origin `fetch` for a path that a dynamic route matches goes to the app, also when it is for a file in `public/`, which a deployment serves before it looks at the routes. With `app/[locale]/page.tsx` that is every path of one segment, like `/data.json`. With a catch-all at the root, like `app/[...slug]`, it is every path.
- A form that is posted without JavaScript, before the page has hydrated. Such a request names its action in the form data and not in a `next-action` header, and the server does not look there: it renders the page and does not run the action.
- A navigation that leaves the page without Next's router, like `location.assign()`, is turned into a page load with the Navigation API, which today means Chromium.
- A timer that the app starts keeps running after its page is left, like the one `next-themes` uses to turn transitions back on. A browser drops it with the page. Here it fires later, and fails if it touches the document of its page. A test that ends right after the app loaded a page itself, like the page a node links to, can run into that: wait for the page to settle first.
- Every `renderServer()` loads React and the app's client code again, as a page load does. The plugin releases a page when the test leaves it: it removes what React and Next left on the tab while they loaded. What the app's own code leaves on the tab keeps that page in memory, as in a tab that never reloads: a listener on `window`, an interval, a global. That is the app's to clean up, like in the cleanup of an effect. A page has a `<body>` of its own, which goes with the page, and so has a node. So a portal into `document.body` keeps nothing, though React adds its listeners to the body. If the tab grows too much, use `isolate: true`: every test file then starts in a new page, and loads the server of the app again.
- A test file starts slowly: its tab loads Next's runtime for three layers before the first test. With as many tabs as cores, the first test of a file can time out. `playground/nextjs-notes-demo` sets `maxWorkers: 4` for that.
