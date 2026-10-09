# Next.js: How It Works

`vitest-plugin-rsc/nextjs/testing-library`, together with the plugin from `vitest-plugin-rsc/nextjs/plugin`, runs a Next.js App Router app in the browser test runtime: the server that answers a request, the HTML it renders, and the client that hydrates it. This page explains how it works and what it does not do yet. The [README](../README.md#nextjs) shows how to use it.

It needs `next@16.4` or later. In that release Next's request stores became one per realm, which lets the three layers below run as separate module graphs. It also needs `@next/routing`, the Next.js package that finds a request's route, at the same version as `next`. See [The Server In Front Of The App](#the-server-in-front-of-the-app).

## The Idea: Port The Build, Run The Runtime

Next.js is two things. One is a build, written for webpack and Turbopack, that turns `app/` into bundles. The other is a runtime, in `next/dist`, that those bundles run on: the request handler, the renderer, the router and the caches.

Only the build is tied to a bundler. So this plugin does the build with Vite, and asks Next's own build code for everything that is not bundling:

| What                                         | Where it comes from                                                                  |
| -------------------------------------------- | ------------------------------------------------------------------------------------ |
| The app's routes                             | `next/dist/build/route-discovery`, `normalizeCatchAllRoutes()`                       |
| What the server does before a route          | `handleBuildComplete()`: what Next's build hands a deployment adapter                |
| Which route a request gets                   | `resolveRoutes()` from `@next/routing`, see [below](#the-server-in-front-of-the-app) |
| The request handler for `proxy.ts`           | `next-middleware-loader`, Next's webpack loader, called as-is                        |
| A route's loader tree: page, layouts, errors | `next-app-loader`, Next's webpack loader, called as-is                               |
| A page's request handler                     | `next/dist/build/templates/app-page-runtime`: `handler(req, res)`                    |
| A route handler's route module               | `next-app-loader` again, which expands `templates/app-route`                         |
| A route handler's request handler            | In the same template, `templates/app-route`: `handler(req, res)`                     |
| Compile-time constants                       | `getDefineEnv()`                                                                     |
| Module aliases, per layer                    | `createWebpackAliases()` and the other alias tables                                  |
| React                                        | The React that Next ships, through `createVendoredReactAliases()`                    |
| Compiling an app source file                 | Next's SWC transform, with `getLoaderSWCOptions()` for its layer                     |
| A call to a `next/font` function             | `next-font-loader` and Next's `css-loader`, called as-is                             |
| An imported image                            | `next-image-loader`, called as-is                                                    |
| The plugins of PostCSS                       | `getPostCssPlugins()`, with Next's defaults                                          |
| The class name and the mode of a CSS module  | `getCssModuleLoader()`: its `getLocalIdent` and `mode`                               |
| An image behind `/_next/image`               | Next's image optimizer, `next/dist/server/image-optimizer`                           |

Everything behind those is Next's runtime, unchanged. What it writes to its server's response is the `Response` the browser gets.

The routes are listed the way `next build` lists its entries. Pages with the same pathname are one route, and a catch-all page in a slot is added to the routes it also matches. An app whose routes `next build` rejects is rejected here too, with Next's own errors: pages no route matches, slots that cannot render the same URLs, and, with `strictRouteMatching`, an interception route without the route it intercepts. The loader gets the options a build passes, so a layout with only slots has no `children`, as in a deployment.

### When Next Changes

All of this is internal to Next, and it changes between minor versions. The build code's output names the runtime it was made for: the constants the runtime reads, the files an alias leads to, the arguments a template passes. So the plugin does not bring its own copy of Next's build code. It calls the build code of the installed `next`, from one place: `project.ts` and the files in `project/`, which are typed against Next's own declarations. `project/context.ts` loads the modules of Next's build that the plugin calls, and an export that is gone fails with the message below where it is read.

That code checks what the plugin relies on. It does so when a run starts, or for a loader when that loader is first used. The checks cover the build code, and the runtime that the plugin's own modules call in the browser. In the runtime it checks what would fail silently, or without saying why: a hook, a global, `document.currentScript`, what the `server-reference-info` shim replaces, the manifests. A static import of a name that is gone needs no check, because the module fails to link with a `SyntaxError` that names it. The check only reads the runtime's files and does not load them, because they run in the browser. A Next.js that differs stops the run with one message that gives the version and what is different.

| What is checked                                                                                                                       | Without the check                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Every file and export of the build code that is called                                                                                | A `TypeError` somewhere in the plugin                                              |
| `discoverRoutes()` returns `mappedAppPages`                                                                                           | An app without routes: every URL is a 404                                          |
| `@next/routing` is installed, at the same version as `next`                                                                           | Routes that Next's build hands out and its resolver does not read                  |
| `handleBuildComplete()` calls the adapter, without a build on disk, with every phase of the routes                                    | A `TypeError`, or a server that skips a phase                                      |
| The build has an output for every route, and `resolveRoutes()` finds it for a URL of that route                                       | Every URL is a 404, and nothing says why                                           |
| `getEdgeServerEntry()` loads the middleware with `next-middleware-loader`, whose template calls `require(`                            | A `require` that the browser does not have                                         |
| `getDefineEnv()` sets `process.env.NEXT_RUNTIME` to `nodejs` for the server layers                                                    | Next's code takes another runtime's branches                                       |
| The alias tables have `react-server-dom-webpack/server$`                                                                              | A `TypeError` on a path                                                            |
| `IncrementalCache` takes `fs`, `serverDistDir` and `fetchCacheKeyPrefix`                                                              | Nothing is cached, or a test finds another test's entries                          |
| The SWC transform turns a call to a `next/font` function into an import of `next/font/.../target.css?`                                | A font function that throws, without a message                                     |
| The SWC transform marks a `"use client"` module in the `rsc` layer                                                                    | A client module that asks for the `require` of Next's bundler                      |
| `getNextFontLoader()` uses css-loader and next-font-loader, and css-loader makes a list of CSS with `locals`                          | A font without CSS, or without class names                                         |
| `getCssModuleLoader()` gives css-loader the `mode` and the `getLocalIdent` of a CSS module                                            | Class names and a mode of a CSS module that are not Next's                         |
| `next-image-loader` makes a module that starts with `export default {`                                                                | An imported image that is not what `next/image` takes                              |
| The app loader's output has `__webpack_require__` and imports `app-page-runtime`, which imports the route module as `module.compiled` | A `require` that the browser does not have, or a route module from the wrong layer |
| The `app-route` template loads `route.ts` with `userland: () => require(`                                                             | A `require` that the browser does not have                                         |
| `stream-ops` reads `process.env.__NEXT_USE_NODE_STREAMS`                                                                              | Next renders to Node.js streams, which a browser does not have                     |
| The app loader imports the module of a page by its file, by which Next's build finds the segments of a route                          | A page without its CSS                                                             |
| Next's renderer looks up the CSS of a segment in `entryCSSFiles` by its file without the extension, and links it under `/_next/`      | A page without its CSS, and nothing says why                                       |
| The client entry has `hydrate()`, which the plugin imports once the page is there                                                     | A `TypeError` when a page loads                                                    |
| Next's root component calls `__NEXT_HYDRATED_CB` under `process.env.__NEXT_TEST_MODE`                                                 | `renderServer()` waits for the page to hydrate until the test times out            |
| Next takes its asset prefix from the `/_next/` URL of `document.currentScript`                                                        | The app does not start in the browser                                              |
| `server-reference-info` has the functions the plugin replaces for Vite RSC's ids                                                      | Next rejects the ids of Vite RSC's Server Actions                                  |
| The route module reads the manifests through `load-manifest.external`                                                                 | Next looks for a build's files in `.next/`                                         |

A function that is still there but takes other arguments is not checked. A build-code function then fails with its own error at startup, and a runtime function fails when a test calls it. The check also cannot cover what Next's runtime does with these once a request comes in: a manifest field it starts to read, or a key it starts to require in the loader tree. That shows up as a failing test. For that reason CI runs the two Next.js playgrounds against `next@latest` and `next@canary`.

Next imports its Flight codec as `react-server-dom-webpack`. In the `rsc` layer that codec is Vite RSC's, through adapters that leave out Next's manifests. The layer has every export that the codec in the installed `next` has. An export that the plugin has no adapter for throws when it is called, and says so. A new export that nothing calls does not stop a run.

## Three Layers, Three Environments

Next compiles an App Router app into three layers. Each has its own module graph and its own build of React:

| Layer     | Runs                                                                   | React                | Vite environment |
| --------- | ---------------------------------------------------------------------- | -------------------- | ---------------- |
| `rsc`     | Server Components, Server Actions, route handlers                      | `react-server` build | `client`         |
| `ssr`     | Next's route module, the HTML renderer, the server in front of the app | regular build        | `next_ssr`       |
| `browser` | Next's router, your Client Components                                  | regular build        | `react_client`   |

Here each layer is a Vite environment, with the aliases and constants Next gives that layer. All three run in the browser test runtime. That keeps the test white-box: the `db` your test seeds is the module instance the Server Component reads.

Where Next's bundler config moves a module to another layer, the plugin does the same. The route module is created by the `rsc` layer but belongs to `ssr`. The route's request handler is in `rsc` too, next to the page, and makes the route module with the `ssr` layer's class. Client Components load once for `ssr`, to render HTML, and once for `browser`. A route handler is entirely in `rsc`: its `route.ts`, its route module and its request handler.

## The Compiler

Before Next bundles one of the app's source files, it compiles the file with its SWC transform, and with webpack loaders for fonts and images. The plugin runs those on the app's source files in each of the three layers, with the options Next's build gives that layer. Next's transform strips the TypeScript types, as in Next's build. Vite still compiles JSX and CSS. The exception is JSX in a `.js` file, which Vite does not accept: Next's transform compiles that too.

| What Next's build does                                                                                                                      | Here                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Checking what a layer may do: a client hook in a Server Component, `server-only` in a Client Component, `metadata` in a `"use client"` page | Next's SWC transform. The module throws Next's error when it loads, see below                                                                  |
| `next/font/google` and `next/font/local`, including when a package calls them, like `geist`                                                 | Next's SWC transform and font loaders                                                                                                          |
| `import logo from "./logo.png"`, including an SVG                                                                                           | Next's image loader: `{ src, width, height, blurDataURL }`                                                                                     |
| `next/image`                                                                                                                                | Next's runtime, and Next's image optimizer behind `/_next/image`                                                                               |
| `next/dynamic`, including with `ssr: false`                                                                                                 | Next's SWC transform, which leaves the import out of the server's code. `next/dynamic` also works without it                                   |
| styled-jsx                                                                                                                                  | Next's SWC transform, with the `styled-jsx` that Next depends on                                                                               |
| `compiler` in `next.config`: `removeConsole`, `reactRemoveProperties`, `styledComponents`, `relay`, and `experimental.swcPlugins`           | Passed to Next's SWC transform. Only `removeConsole` is tested                                                                                 |
| `"use client"`, `"use server"`                                                                                                              | Vite RSC                                                                                                                                       |
| `typeof window` in server code                                                                                                              | A define, see [Server Code In The Browser](#server-code-in-the-browser)                                                                        |
| `server-only`, `client-only`                                                                                                                | Next's SWC transform stops at the wrong one in a source file. In a package, Next's aliases make it a module that throws. That is not tested    |
| `paths` and `baseUrl` in `tsconfig.json` or `jsconfig.json`                                                                                 | Read with Next's `loadJsConfig()`, and resolved for every app file, as Next's build does                                                       |
| Global CSS, CSS modules, PostCSS                                                                                                            | Vite bundles it, with Next's PostCSS plugins and Next's class names of a CSS module. Next's renderer links it, see [Stylesheets](#stylesheets) |
| `next/script`                                                                                                                               | Next's runtime, nothing to compile                                                                                                             |

**Fonts.** A call like `Inter({ subsets: ["latin"] })` becomes an import of the font's CSS. Next's font loader writes that CSS: the `@font-face` rules, a fallback font with adjusted metrics, and the class names that the call returns. The font files are served under `/_next/static/media/`, where the CSS says they are. `next/font/google` downloads a font from Google Fonts when a run first loads it, as `next dev` does. Without a network it sets the fallback font and logs the download error. That is not tested. To keep a test run off the network, set `NEXT_FONT_GOOGLE_MOCKED_RESPONSES` to a file with Google Fonts' responses, which is how Next tests `next/font/google` itself. See `vitest.google-fonts.cjs` in this repository.

**Images.** An imported image is the object `next/image` takes, with the file under `/_next/static/media/`. Next's image optimizer answers `/_next/image` in the Vitest process, as `next start` does, with the `images` settings from `next.config`, like `remotePatterns`. It keeps no cache, and tells the browser not to keep the image either. It needs `sharp`, which Next installs as an optional dependency. An image from another server is downloaded when the browser asks for it.

**Build errors.** Nothing is built up front. So the plugin finds an error that would stop `next build` when a test loads the module. The module then throws Next's error, as a module does in webpack's development build. In the `rsc` layer that fails the request, so `renderServer()` rejects with the error. In a Client Component it fails the render on the server and in the browser. Next shows its error page, and the error is logged and reported as uncaught, which fails the test run. A module that only a test file imports is also an `rsc`-layer module. If it calls a client hook without `"use client"`, it throws when the test imports it, unless it is in `browserModules`. What a test file with `"use client"` imports is of the `browser` layer, see [A Test File With `"use client"`](#a-test-file-with-use-client).

An app source file is any JavaScript or TypeScript file that Vite serves and that is not in `node_modules`. A package is pre-bundled as it is, except for a file in it that names `next/font`. That file goes through Next's transform, as in Next's build, for a package like `geist`. The `rsc` layer shares its environment with the test, so there the test files, setup files, the files of [another host](#another-host) and `browserModules` are not compiled. See [Server Code In The Browser](#server-code-in-the-browser).

**CSS.** Next compiles CSS with webpack loaders: `css-loader` and `postcss-loader`. Part of what they do is bundling: they turn an `@import` and a `url()` into webpack requests, for webpack's module system to load. That part is Vite's here. What is Next's own, and not bundling, comes from Next's build code: the PostCSS plugins, as `getPostCssPlugins()` reads them from the app's config, or Next's defaults when there is none, and the class name of a CSS module, of `getCssModuleLocalIdent()`. A class `card` of `card.module.css` is `card_card__` and a hash, as Next's webpack build names it. Next's Turbopack build, the default of `next build` since Next 16, has a rule of its own: the plugin follows the webpack build, whose loaders it runs. For `next/font` Next's `css-loader` runs as it is, because a font's CSS has no `@import`, and no `url()` that it resolves. A PostCSS config that Next's webpack build does not read, but Turbopack does, like `postcss.config.ts`, is read by Vite. Next holds a CSS module to the mode of its rule, `pure`, where each selector has a class or an id of the module. Vite has no such mode, so Next's own check, `postcss-modules-local-by-default`, runs on a copy of each CSS module and Sass module, with the mode that Next's `getCssModuleLoader()` gives css-loader. A selector like `body {}` is then an error of that module, with Next's message, as under **Build errors** below, and the comment `/* cssmodules-pure-no-check */` lets it pass, as in Next. A config of the CSS in the Vitest config, `css.postcss`, `css.modules` or `css.transformer`, wins over Next's, and a run says so when it starts, as it does for `experimental.useLightningcss`, which Next would compile with.

### Stylesheets

Next's build lists the CSS of every layout, page and boundary: the CSS that the file imports, with that of the Client Components it imports. That list is `entryCSSFiles` in the client reference manifest. Next's renderer reads it for each segment of a route, and puts a `<link rel="stylesheet">` for each file next to the segment. So the CSS of a route belongs to its page. A page load starts without it, and Next's router adds the stylesheets of the route it navigates to, as in a browser.

Vite does it another way: a module that imports CSS puts it in a `<style>` when it first loads, and that is once for the browser. Global CSS of one route would then still apply after a test has opened another one. So for the CSS of the app the plugin does what Next's build does (`src/nextjs/styles.ts`):

- An import of CSS in the server code of the app and of its packages, and in the `ssr` and `browser` layers but for a file of the host with `"use client"`, gets a query, `?next-linked`. So does an import of a package that is a stylesheet, like `@fontsource/inter`. Its module puts nothing in the document, and exports the class names of a CSS module, as Vite's module for a server does: the plugin keeps the exports of Vite's module for the file, and drops the statements that add the `<style>`. A Vite whose exports need those statements stops the run with a message.
- Before Next renders a route, the browser asks the dev server for the list, at `/@vitest-plugin-rsc/next-stylesheets`, under Vitest as under [another host](#another-host). Next reads it before it loads the module of a segment. The files of the segments are those that the route's entry imports by an absolute path, as Next's build finds them. The plugin walks Vite's module graphs from the file of each segment, in the `rsc` layer and, from a Client Component, in the `browser` layer. The graph has only what was loaded, so the plugin transforms what it walks first, which the browser asks for right after. It walks the modules of code only, as Vite tells them by their extension, and the page extensions of the app: not an image or a `.json`, and not a file that a module refers to with `new URL(…, import.meta.url)`, like the `.wasm` of a package, which Vite adds to the imports of the module.
- The dev server serves a stylesheet where Next links it: the path of the file under `/_next/static/css/`, or a hash for CSS that is no file, like that of a font. It is the CSS Vite makes of the file, so with PostCSS, Tailwind and the class names that its module exports.
- With `experimental.inlineCss`, the list has the CSS of each file too, and Next puts it in a `<style>` of the page, as it does for `next start`. A navigation of Next's router still links it.
- `renderServer()` resolves once the stylesheets of the page have loaded, and the page is gone with them.
- A [static build](#a-static-build) has each stylesheet in a file of its own under `/_next/static/css/`, and in `vitest-plugin-rsc/next-stylesheets.json` the lists of every page route and of every file of the host, by its path from the root, read off the module graphs of the build. Vite leaves those stylesheets out of the CSS of its chunks. A URL of a file of `public/` with a query or a fragment, like `url(/fonts/icons.woff2?v=4)`, is read from the source of the stylesheet, as Vite's build names the file by all of it.

What differs from `next start`:

- **One stylesheet per CSS file**, in the order of the imports. Next's build joins the CSS of a segment into a chunk.
- **A node has the CSS of what the files that render it import**: under Vitest the setup files and its test file, under Storybook `.storybook/preview` and its story file, in that order. The plugin cannot tell which components a node renders. The host says which files render it (`nodeFiles()` in `src/nextjs/registry.ts`, which the Storybook framework of the playground sets with `setNodeFiles()` of `vitest-plugin-rsc/nextjs/internal`), and the page sends them with its question, by their path from the root. The dev server answers only for files of the host. A static build has the CSS of each file of the host, so a story there has the same CSS as with a dev server. A host that does not say has the CSS of every file of the host that Vite has loaded, and in a static build of every file of the host. With `layouts: true` the layouts around a node have their own.
- **In a static build, `experimental.inlineCss` links the CSS**: a stylesheet of the build names a file, like a font, by the way from the stylesheet.
- **CSS that a test file, a setup file or one of the `browserModules` imports itself** is Vite's `<style>`, and stays in the browser, as it would without Next. The CSS of a `next/font` call is linked all the same, also when a test file imports the font.
- **An edit to a CSS file** arrives with the next page load. A page that is open keeps the stylesheet it has.

[Not Yet](#not-yet) lists what Next's build does and the plugin does not.

## A Request

```
renderServer({ url: "/notes/1" })
  │  GET /notes/1                          the browser's fetch, with its cookies
  ▼
ssr      resolveRoutes()                   Next's route resolution: redirects, proxy.ts, rewrites
  │        └─ rsc: proxy(request)          the proxy of the app, if its matcher takes the request
  ▼
rsc      handler(req, res)                 Next's request handler for the route
  ▼
ssr      prepare(), render()               Next's route module
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

After that, Next's router is in charge. A `<Link>` navigation is an RSC request to the same handler. A Server Action is a `POST` with a `Next-Action` header. Both go through the route resolution first. See [The Server In Front Of The App](#the-server-in-front-of-the-app).

## A Component

`renderServer(<Node />, { url })` renders one node the way Testing Library renders a component: in a `<div>` in `document.body`, without the app's layouts, and without the server in front of the app (see [Without The Server In Front](#without-the-server-in-front)). It is not a second renderer. The node is the page of a route, and the request for it is the one above.

```
renderServer(<Node />, { url: "/notes/7" })
  │  GET /notes/7                          the same request, with the browser's cookies
  ▼
rsc      handler(req, res)                 the same request handler, for the route of the node
  ▼
rsc      loader tree → Flight              a tree with the node as its page, and no layout
  ▼
ssr      Flight → HTML                     no <html> or <body>: nothing in the tree renders them
  ▼
browser  the HTML goes into the container  with Next's inline scripts, which run
         Next's client entry hydrates it   the container, where it would hydrate the document
```

### The Route Of A Node

The route exists for as long as the node is there, at the pathname of `url`. The plugin writes its loader tree itself, instead of using `next-app-loader`. That loader reads a directory of files, and it ends the process for a page without a root layout. Next's renderer needs no layout. The tree goes into Next's own `app-page` template, with the injections `next-app-loader` makes. From there on the route is a page like any other, with the same request handler, manifests, cookie jar and cache.

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

- **The segments** are those of the app's route for the URL, so Next finds the same params. Next's route resolution says which route that is, as it does for every request. By default it does so from the app's routes alone, for the URL as given. With `proxy: true` it goes through the proxy and `next.config` first, so a rewrite decides. A URL that matches no route gets the tree of `/`, which has no params. A route handler's pathname has a tree too.
- **The page name** matches the pathname, like `/notes/[id]/page`. Next derives the `revalidatePath()` tags from it.
- **No layout**, not even a pass-through one. So the HTML has no `<html>` or `<body>`, and it fits in a `<div>`.
- **Next's builtin boundaries** are the only other modules, and they sit at the root. They are `global-error`, without which Next's renderer throws, and `not-found`, `forbidden` and `unauthorized`. `next-app-loader` gives them to a root that has none of its own. They are Next's, not the app's.
- **The root segment is not `""`**, which is the root of every tree in the app. That is part of what makes leaving the node a page load, see below.

There is one such route for each of the app's pathnames, and one for `/`. They are in the same lists as the app's pages, and they load when they are first requested.

### A Node In The Layouts Of A Route

With `layouts: true` the node takes the place of one of the app's pages. `renderServer(<Node />, { url, layouts: true })` renders the app's route for that URL, with the node where its `page.tsx` would be. The entry is the one `next-app-loader` writes for that route. Its loader tree names the page by its file, and the plugin replaces that one module with the node:

```js
// what next-app-loader writes for app/notes/[id]/page.tsx
children: ["__PAGE__", {}, { page: [page8, "/…/app/notes/[id]/page.tsx"] }];
// what the route of the node has
children: ["__PAGE__", {}, { page: [__next_component__, "vitest-plugin-rsc/component"] }];
```

The rest of the tree is the app's: the layouts, `loading`, `error`, `not-found`, the slots of parallel routes, and the root segment. So the response is a whole document, with the root layout's `<html>` and `<body>`, and it loads like a page, not in a container. Both trees have the app's root layout, so a navigation to one of the app's pages stays on the client.

- The app must have a `page` file for the URL. A route handler, a path without a route and a route with only slots are errors, because there is no page for the node to stand in for.
- The page file is still a module of the entry, though nothing calls it. Its own exports, like `generateMetadata` and `revalidate`, are not used.
- The route keeps the app page's name, so the params and `revalidatePath()` work as they do for that page.
- The node owns its pathname while it is there, as a node without layouts does.

### Next's Router In A `<div>`

Next's client entry, `app-index.js`, builds the app and calls `hydrateRoot(document, …)`. There is no option for another root. The plugin already wraps `ReactDOMClient.hydrateRoot` and `createRoot` for the duration of that call, to keep hold of the root, which Next does not expose. For a node, the same wrapper passes the container where Next passes `document`. Nothing else differs. Next's own `hydrate()` creates the router state from the Flight payload in the page and renders its own `AppRouter`. So `Link`, `useRouter()`, `usePathname()`, `useParams()`, `useSearchParams()`, `router.refresh()` and Server Actions are Next's. No router state is made up.

The server's HTML is a fragment: hoisted tags like `<meta>`, the node, and Next's inline scripts. The HTML parser puts the leading tags in `<head>`, where React looks for them. What it puts in `<body>` goes in the container, in the same order: the node, with any `<script>` it renders itself, and after it Next's scripts, which run as they do for a page. The rest of the document stays the test's, so nothing is parked. The document gets a new `<body>` for as long as the node is there, holding what the test has in its body. What the node leaves on that body, like the listeners React adds for a portal, goes away with it. That is why the container has to be empty, and cannot be `<body>`.

Not every response for a node is that fragment. When it is not, the response loads as the page it is, in the document, and the container stays empty:

- A node that calls `redirect()` while it renders gets the page it redirects to. The node's route is gone.
- A node that throws, or calls `notFound()`, gets a whole document from Next, with `<html id="__next_error__">`. Next has no HTML for it and renders its global error page, or its not-found page, in the browser. Next's client entry does that with `createRoot(document)`, as it does for any page.

React listens for events on the root's container. For a node that is the `<div>`, not `document`. Only `selectionchange` is on the document. The plugin removes both sets of listeners when the node is left, as it does for a page, because the container can be the test's and outlive the node.

### Leaving The Node

A request belongs to the node when its pathname is the node's. A change of search params, `router.refresh()` and a Server Action stay with the node.

A navigation to another pathname gets the app's route for that pathname. Next's router then walks the tree it has and the tree it gets, from the root (`render-tree.js`). It loads the page, instead of navigating on the client, when three things hold at a segment:

1. The two trees do not match there. For the root, Next compares the segments themselves (`doesRouteStructureMatch()`), and these differ: `(vitest-plugin-rsc)` and `""`.
2. The new tree's segment is in its root layout or above it (`PrefetchHint.IsRootLayoutOrAbove`). The root of any of the app's trees is.
3. `isNavigatingToNewRootLayout()` says the root layout is a different one. It already does at the root, because the segments differ.

So the plugin's page load takes over, the same one a `location.assign()` gets. The node is unmounted, the document becomes the page's, and the node's route is gone.

This is how an app with two root layouts, in two route groups, moves between them. A node has no layout at all, so every segment of its tree counts as above the root layout, and none of the app's pages shares a root layout with it.

A link to the node's own pathname stays with the node. With the default URL that pathname is `/`, so a `<Link href="/">` in a node does not load the app's home page.

A link in a node is not prefetched, and neither is one in a page. `NODE_ENV` is `"test"` in the browser. Next marks a link as visible only when `NODE_ENV` is `"production"` (`links.js`), and it does not prefetch a link that is not visible, not even on hover.

### Rendering The Node Again

`rerender(ui)` renders the node again in place, without a page load. The route of a node reads the node from the registry each time the server renders it (`loadComponent()` in `rsc.ts`). So `rerender()` puts the new node there and has Next's own router of the page ask for the route again, with the `refresh()` of `router.refresh()`. That is one request of the router, for the node's pathname. The server answers with the Flight payload of the route, and React reconciles it with the page: what stays the same keeps its state, as in a refresh of a page.

The request of `rerender()` carries the `headers` of `renderServer()`, as every request of the page does after its document: see [Request Headers And Cookies](../README.md#request-headers-and-cookies).

The server renders a node of the server inside `NodeRendered`, a Client Component of `client-node.tsx` that renders only its children, and passes it the number of the render. Its layout effect tells `rerender()` which render the page has committed. So `rerender()` resolves once React has committed the new node, or a later one: not when the response arrives, and not after a timeout. A Suspense boundary of the route, like its `loading.tsx`, can hydrate the node after `renderServer()` has resolved, and a rerender before that waits for it.

The page can show something else in the node's place:

- An error, `notFound()` or `redirect()`, which a boundary of Next or of the app catches.
- Another route. A navigation from a node is a page load (see above). In the layouts of a route, a navigation to another page of the app is not.

Then the node is no longer on the page. A passive effect of `NodeRendered`, or of `client-node.tsx` for a node of the browser layer, says so, and the rerender resolves: the page shows what it has in the node's place, as for a page. It is a passive effect because Suspense takes down the layout effects of what it hides behind a fallback, and leaves the node on the page. A node that is still to hydrate has no effects yet. For it, the plugin hears of an error from React, through the `onCaughtError` and `onUncaughtError` that Next's entry gives the root. An error that a boundary inside the node catches leaves the node on the page, and it renders again as before.

Once the node is no longer on the page, `rerender()` rejects: it has no node to render again. It also rejects once the page is left: by `unmount()`, `cleanup()`, another `renderServer()`, or the page load of a navigation.

A node of the browser layer renders again where it is. `rerender()` hands `client-node.tsx` the new node, which reads it with `useSyncExternalStore`, and React commits it without a request. The page of `renderServer({ url })` has no node to replace, and no `rerender()`.

### What It Needs Of Next

Checked at startup, like the rest (see [When Next Changes](#when-next-changes)):

| What                                                                                                                                 | Without it                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| The `app-page` template takes `tree`, `__next_app_require__` and `__next_app_load_chunk__`                                           | No route for a node                                                  |
| `next/dist/client/components/builtin/` has `global-error.js`, `not-found.js`, `forbidden.js` and `unauthorized.js`                   | No route for a node                                                  |
| `app-index.js` has `const appElement = document`, and calls `hydrateRoot(appElement` and `createRoot(appElement`                     | The node hydrates the document, or nothing                           |
| `segment-cache/cache.js` compares the root segments of two trees                                                                     | A link from a node renders one of the app's pages in the container   |
| `render-tree.js` calls `doesRouteStructureMatch(`, reads `PrefetchHint.IsRootLayoutOrAbove` and calls `isNavigatingToNewRootLayout(` | The same                                                             |
| `app-router-instance.js` exports `publicAppRouterInstance`, the router of `useRouter()`                                              | No `rerender()` of a node of the server                              |
| `app-index.js` gives its root `reactRootOptions`, with `onCaughtError` and `onUncaughtError`                                         | A rerender of a node that throws before it hydrates does not resolve |

Not checked: the shape of a loader tree, `[segment, parallelRoutes, modules, staticSiblings]`. The tests that render a node fail when it changes.

## A Test File With `"use client"`

In Next a file with `"use client"` is code of the `browser` layer, and so is a test file with it here. `renderServer(<Node />)` in such a file renders the node in the browser and not on the server. The node is not sent through Flight, so a prop is passed as it is: a function stays that function, like a `vi.fn()` the test asserts on.

```
renderServer(<Button onClick={vi.fn()} />)      in a test file with "use client"
  │  GET /                                       the request of a node, as above
  ▼
rsc      loader tree → Flight                    the page is one Client Component: client-node.tsx
  ▼
ssr      Flight → HTML                           that component renders nothing on the server
  ▼
browser  Next's client entry hydrates it         then client-node.tsx renders the node of the test
```

Vitest still imports the file in its own environment, which is the `rsc` layer, to collect its tests. There the file is a stub: it has the page evaluate the file for the `browser` layer, and has its exports. The tests the file registers go to Vitest, since its `test()` is the page's own. The file runs once, and its tests render in page after page. Each page load has a module graph of its own, as in a browser, since Next's client starts once in a graph. So what the file imports is not evaluated with it. An import is a view on the module of that name in the graph of the page that is open: a module runner compiles the use of an import to a read of a property, so `<Button />` reads `Button`, and `jsxDEV`, from that page when it runs. The component is the page's own, with the page's React and the page's router. When the page is left, the next graph loads what the file imports before the test goes on.

What the file imports from Vitest, like `vi`, `expect` and `vitest/browser`, is not a copy: it is the page's own module, which has the test that is running. The same goes for `vitest-plugin-rsc/nextjs/testing-library` and the setup files.

What follows from that:

- What the file imports is the `browser` layer's copy of a module. A `db` it imports is not the one the Server Components read. Seed the server from a setup file, or from a test file without the directive.
- A value the file computes from an import when it loads, like `memo(Button)` in a constant, stays the one of the first page. So does an element made while a page is open: `renderServer()` throws for a node with a component of the page that is open, made before that page was left.
- `vi.mock()` and `vi.hoisted()` are an error, see [Mocks](#mocks).
- `renderServer()` resolves once the node has rendered, which can be after the page has hydrated: a Suspense boundary, like the one of a route's `loading.tsx`, hydrates later. It rejects when the node has not rendered ten seconds after the page hydrated.

A host renders an export of such a file with `clientNode(module, name, props)`. That is how a story with `"use client"` renders in Storybook, with its args as they are: the framework of the playground asks the plugin which module and export a story is, with an internal helper.

## Route Handlers

An `app/**/route.ts` is a route like a page is, with a request handler from a different template:

```
handleRequest("/api/notes/1", { method: "PUT", body })     or fetch() in a Client Component
  │  PUT /api/notes/1                      with the browser's cookies
  ▼
rsc      handler(req, res)                 Next's request handler for the route handler
           └─ AppRouteRouteModule          Next's route module: the request stores, cookies(),
              └─ PUT(request, { params })  redirect(), notFound(), HEAD and OPTIONS, 405
  │  200 application/json                  Set-Cookie goes into the browser's cookies
  ▼
the caller gets the Response               its body as the handler writes it
```

There is no HTML to render, so the `ssr` layer plays no part. A module that `route.ts` imports is the same instance the test imports, and `vi.mock()` replaces it for both.

The request handler is Next's own, the one `next start` calls. It finds the route params in the URL, makes the `NextRequest`, and writes the handler's `Response` to the server's response. A handler that throws is answered with `500` and no body, and Next logs the error with `console.error`.

Next hands the work it does for a request after responding, like `after()` callbacks, to `waitUntil`. The request lasts until that work is done, so the callbacks read their own request's stores. A request that comes in meanwhile waits for that work, for one second at most. A nested one, which the server makes to itself while it handles another, lasts one second at most after its response. Leaving a page waits for all of it, also at the end of a test: five seconds at most, with a warning when it has to stop waiting.

## The Server In Front Of The App

Before a route gets a request, a server has decided which route that is. In a deployment that server is `next start`, or the platform the app is deployed to. It applies the `redirects`, `headers` and `rewrites` from `next.config`, redirects a URL with a trailing slash, runs `proxy.ts`, and then looks for the route. Here that server runs in the browser too, in front of the request handlers above.

Next has a contract for a platform that does this itself: a deployment adapter. `next build` hands an adapter that server's routes, in the order they apply, and what it built for each pathname. Next ships the matching resolution as a separate package, `@next/routing`. The plugin is such an adapter:

| What                                                           | Where it comes from                                                                                         |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| The redirects, rewrites and headers from `next.config`         | `loadCustomRoutes()`, which adds Next's own trailing-slash redirect                                         |
| An interception route, which is a rewrite to Next              | `generateInterceptionRoutesRewrites()`                                                                      |
| A build's routes manifest, which Next's route module reads too | `generateRoutesManifest()`                                                                                  |
| The proxy's file and its matcher                               | `getFilesInDir()` with Next's names for the file, `createPagesMapping()`, `getStaticInfoIncludingLayouts()` |
| The server's routes, in their phases, and the outputs          | `handleBuildComplete()`, which calls the adapter's `onBuildComplete()` in `adapter.ts`                      |
| The headers that a request may not bring                       | `filterInternalHeaders()`, which `next start` calls on every request                                        |
| Which route a request gets, a redirect, or a rewrite           | `resolveRoutes()` from `@next/routing`, in the browser                                                      |
| The proxy's request handler                                    | `getEdgeServerEntry()` and `next-middleware-loader`, which expands `templates/middleware`                   |
| What the proxy's response means for the request                | `responseToMiddlewareResult()` from `@next/routing`                                                         |

An interception route, like `@modal/(.)photo/[id]`, needs no plugin code for this. Next's build turns it into a rewrite, for a router request that says which page it comes from.

`handleBuildComplete()` is the end of `next build`. It runs here without a build. It gets the manifests of a build whose routes read no files, and an empty directory for the rest. The dynamic routes' patterns, the conversion of a redirect to a `Location` header and the proxy's matcher are what Next computes for an adapter. The plugin writes the manifests that Next computes them from: a function for each route, and for a proxy without its own matcher the matcher for every path, as Next's build writes it.

Two `next.config` settings are left out. `i18n` belongs to the Pages Router, and the plugin drops it from the config altogether. An App Router URL has no locale, and with `i18n` set the resolution and the proxy look for one in every URL. `output: "export"` is left out for this step, because with it Next's build reads the files it exported. The app's routes are the same without them.

### `@next/routing`

`resolveRoutes()` takes a URL, the request headers, the routes and the outputs' pathnames, and says what the request becomes: a redirect, a rewrite to another server, a response from the proxy, or a route with its params. It uses only web APIs and has no dependencies, so it runs in the browser unchanged. Its phases, in order:

```
beforeMiddleware    the headers and the redirects of next.config, the trailing slash
proxy.ts            if its matcher takes the request
beforeFiles         rewrites, also at a URL that a route has
the outputs         the routes with a fixed path
afterFiles          rewrites
dynamicRoutes       the routes with a dynamic segment
fallback            rewrites, for a URL that no route has
```

The routes also have `onMatch`, which is not a phase of its own: it holds headers that the resolution adds once it has found a route.

This is the server of a deployment through an adapter, which is not `next start` in every detail. A test pins two differences. First, `resolveRoutes()` also runs the proxy for a request that `next.config` redirects, or whose trailing slash is redirected, and answers with the redirect afterwards. `next start` answers with the redirect first. Second, it matches a URL against a dynamic route's pattern in any letter case. `/Docs/Routing` is the route `/docs/[slug]` with `Routing` as the slug, where `next start` has no route for it.

`@next/routing` is a separate package: a project installs it alongside `next`, at the same version. The two are released together, and what one version of Next hands an adapter is what that version of the package reads. The adapter API has been stable since Next.js 16.2. But what it hands an adapter has no version of its own and grows from release to release: between 16.2 and 16.4 it gained the proxy's matchers. So the plugin does not accept another version as close enough. A run stops when the versions differ, or when the package is missing, and names the version to install. At startup the plugin also resolves a URL for every route in the app, with the routes it got. A build and a resolver that no longer fit would make every URL a 404.

### What The Adapter Does Itself

`@next/routing` finds the route. What happens next is up to the adapter, and Next's own adapters have code for each of these too. Here that code is in `handle()` in `ssr.ts`:

- **Next's internal headers** are taken off a request when it comes in, before the resolution and the proxy read it. These are the headers that only Next's own layers set on a request, like `x-middleware-set-cookie`. A request that brought one itself would have a cookie that the app never set. The proxy sets them on the request afterwards, for the route.
- **A redirect** is a response with the status and the headers the resolution gives.
- **A rewrite to another server** is a `fetch` to that server, where `next start` proxies the request. The browser makes the request, so its rules for a request apply: CORS applies, a redirect is followed, and the browser sets the request's `host`, `cookie` and `origin`. A destination on the app's own origin is answered by the dev server, not by the app.
- **A route** is called with the URL the browser asked for, even after a rewrite, as `next start` calls it. So `usePathname()` says where the browser is, not where the rewrite went. The route gets the rest through the request meta, where `next start` and a deployment adapter put it. The request meta carries the route's params. They come from the pathname the resolution ends at, read with Next's own matcher for the route. They do not come from the resolution's query, which also has them under names like `nxtPid`, because `@next/routing` reads a `+` or a `%25` in them as a query does. After a rewrite, the request meta also carries the query of the rewrite's destination. A request that was not rewritten keeps the query of its URL.
- **`x-nextjs-rewritten-path` and `x-nextjs-rewritten-query`** are set for a request from Next's router that was rewritten. `next start` sets them for a `next.config` rewrite, and Next's own code sets them for a proxy rewrite. The query leaves out `_rsc`, which the router adds to its own requests.
- **The headers** that the resolution has for the response, from `next.config` and the proxy, are set on the response before the route runs, as `next start` does. A page adds to them, like React's `Link` for its stylesheets. A route handler cannot replace one: Next sets a header of its `Response` only where there is none, apart from `set-cookie`, `vary`, `www-authenticate` and `proxy-authenticate`, which it adds to. A cookie from either side is set. The resolution has no headers for a request that the proxy answers itself, so that response lacks the `next.config` headers, which `next start` does set.
- **How a request spells a pathname.** `resolveRoutes()` compares a pathname with the outputs exactly as it is written. So each output is also listed percent-encoded, the way a URL spells `/release notes`, and with `trailingSlash: true` also with the slash. Another spelling of the same path, like `%c3%bc` for `%C3%BC`, is not listed, although `next start` does find the route for it. A dynamic route is found by its pattern, which has the folders as they are named. So `resolveRoutes()` does not find a dynamic route under a folder whose name a URL percent-encodes, and a run warns about those routes when it starts.
- **A request that resolves to nothing** gets the not-found page, or goes to the network: see [below](#which-requests-are-the-apps). That includes a rewrite to a path that no route has, like a file in `public/`. The resolution does not say where such a rewrite went, so the network is asked for the request's URL.
- **The not-found page's status**, `404`, is set on the response before the route runs, as `next start` sets it. Next reads it while it renders, and adds `<meta name="robots" content="noindex">`. The response keeps the status that Next's handler leaves. So a Server Action request for a path that no route has is answered for the action, with `400` or `409`.

### The Proxy

`proxy.ts`, called `middleware.ts` before Next.js 16, is a module in the `rsc` layer, which the test shares. So the proxy is the same instance the test imports, and so are the modules it imports, and `vi.mock()` replaces them for both. In a deployment it is a separate bundle.

Its request handler is Next's: the template that Next's build expands for it, around `adapter()`. `adapter()` makes the `NextRequest`, enters the request stores, and turns `NextResponse.next()`, `rewrite()` and `redirect()` into the headers the resolution reads. The handler takes a `Request` and answers with a `Response`, on Node.js too. For Node.js the template loads two modules with the `require` of Next's bundler, which is `import()` here.

The proxy finishes before the route starts, so it has its own scope for Next's request stores. See [What Stands In For A Server](#what-stands-in-for-a-server). A proxy that throws is answered with `500`, and the error is logged with `console.error`. `next start` answers with its error page.

### Which Requests Are The App's

The app's origin is also the origin of the Vite dev server, which serves the test's modules and the app's. So the browser's `fetch` has to choose. A same-origin request goes to the Next.js server when:

- Next's router or a Server Action sent it, both of which mark their requests with a header, or
- the server has something for it: one of the app's routes, a redirect or a rewrite from `next.config`, or a proxy whose matcher takes it.

The server answers that question with its route resolution, without running anything. Only running the proxy tells what it does with a request, so a request that its matcher takes goes to the server. If the proxy lets the request through and no route has it, a deployment looks for a file. Here the request then goes to the network after all, which has the files in `public/`.

Everything else goes to the network right away: Vite's modules, files in `public/`, a service worker. A page load always belongs to the app: `renderServer()`, `handleRequest()` and a navigation get the not-found page for a URL that resolves to nothing.

A `fetch` that the server makes to its own origin while it renders is chosen the same way, and goes through the proxy too. The server handles it right away, inside the request that waits for it, and follows a redirect, as a server's `fetch` does. Like Node's `fetch`, it rejects a URL that is only a path.

### Without The Server In Front

`proxy` says whether a test goes through this server. `renderServer({ url })` does by default, and `renderServer(<Node />, { url })` does not. With `proxy: false` the URL is taken as it is. `resolveRoutes()` then gets `routing.appRoutes`, which the plugin makes next to the routes when it loads the project: the same routes without `beforeMiddleware`, the proxy's matchers, `afterFiles` and `fallback`, and with only the interception routes of `beforeFiles`. What is left is Next's own: the outputs, `dynamicRoutes`, `onMatch` and the interception routes. So a pathname gets its route with the same params, no redirect, rewrite or header of `next.config` applies, the trailing-slash redirect included, and the proxy does not run.

That holds for the requests that belong to what the test opened, which are the ones to its pathname. `renderServer()` puts the pathname in the registry, with `proxy` and the node, if there is one. `handle()` and `takesRequest()` look it up for every request. So the document, a Server Action, `router.refresh()`, a change of search params and a `handleRequest()` of the test all skip the server in front. So does a client-side navigation back to that pathname. A request to another pathname is the app's, and goes through it: a navigation to another route, a `fetch` to `/api/…`, a page a Server Action redirects to. The pathname goes with the document it opened: it is forgotten when the browser loads another page, also a reload of the same URL, and when the document request ends at another pathname, after a redirect from the page itself. `runInServerAction()` brings a route of its own for its one request instead, without the registry: a node that renders nothing, at the pathname of its URL. A page that is open keeps its own.

## What Stands In For A Server

The server layers run as Next's Node.js server does, with the web APIs that Node.js and a browser share: web streams, `fetch`, `crypto`. The plugin adds the rest of that platform. [The Node.js Runtime](#the-nodejs-runtime) covers what is Node's own.

- **`Request` and `Response`** that keep `Cookie` and `Set-Cookie`, which a browser drops from its own.
- **`fetch`**, so that Next patches the server's `fetch`, not the page's. Next patches it from the `rsc` layer when it first renders, and both server layers call the result. The server's `fetch` and the page's reach the same network.
- **`AsyncLocalStorage`**. A browser cannot carry a store across `await`. Requests are handled one at a time, and the store a request entered first stays readable until the request ends. So when a page is left, a request that the server has not answered yet is waited for, for five seconds at most, and then the body it writes is stopped. That is code of the app, like a Server Action, which nothing can stop: if it went on after its test, it would read and set the stores of the next test's requests. A store that Next enters for part of a request, like a cached function's store, lasts until that part first awaits. See [Caching](#caching).
- **`Buffer`**, **`process`**, and the Node modules that Next's server imports.

For the browser side, the plugin stands in for a page load. The browser cannot navigate away: that would unload the test. So once the whole server document has arrived, the plugin moves it into the test's document, runs its inline scripts in order, and sets the URL with the History API. The test runs in a page of the plugin's (`browser.testerHtmlPath`), not Vitest's own, which has a reset, `body { margin: 0 }`, and Vitest puts that reset in its own page only. So a page, and a node, has the margin of the browser and the CSS of the app, as with `next start`. A project's own `testerHtmlPath` wins. React's scripts in the document wait for a frame before they put streamed content in place, so the plugin has them do it right away. The document has therefore loaded when Next's client starts, and a page's first load does not show a `loading.tsx` or a Suspense fallback. A navigation in the app does, see the README.

For a `redirect()` in a response that had started, Next sends a `<meta http-equiv="refresh">` for a browser without JavaScript, and its router loads the page it redirects to when it finds that tag. A browser drops a refresh that is still pending with the page. This document stays, so the plugin takes the `http-equiv` off the tag before it moves it in: the router still finds the tag, and nothing comes due a second later, in the page that is there by then.

A build knows two things that a request has to find out here:

- **Server Actions.** Next's build lists every action in the app. Here an action is the module and the export that its id names (`<module>#<export>`). So for a `POST` with a `next-action` header, the server checks whether that id names a Server Action, and lists only that one. An id that names none gets the response Next gives when it has no such action: `409`, with `x-nextjs-action-not-found`. Next answers an id that cannot be one with `400`. Here an id can be one when it is shaped like Next's own, 42 characters, or like Vite RSC's. When the action's module fails to load, that error is the response, a `500`.
- **Vite's client.** Vite imports `/@vite/client` into a module with CSS, with `import.meta.hot`, or with a dynamic import it cannot analyse, like the one that loads a Client Component by its id. The `ssr` and `browser` layers load through a module runner, and they get the client the page already has. `vitestPluginRSC()` arranges that for every environment that the page runs through a module runner (`src/vite-client.ts`). A copy of their own would open a websocket per page load, and not to the page's server. A module in a runner has a file URL, so Vite's client falls back to the port the dev server was configured with. That is another server when the port was taken, as it is while a second Vitest run is active on the machine. That server refuses the copy, which then logs an error that it cannot connect. Or the copy reloads the tab: MSW's replacement of `WebSocket` reports `open` before there is a connection, so Vite's client takes the refusal for a server that went away, and reloads once that other server answers its ping.

Next loads `next.config.ts` itself. It compiles the file and runs the result as a module without a filename, so Node resolves the config's relative imports, like `./env.ts`, from the working directory. For `next build` that is the project. For Vitest it can be the workspace root. So the plugin makes the project the process's working directory while Next loads the config, one project at a time.

## Caching

Next's Data Cache works. What `unstable_cache` computes is kept for the next request. So is what a `fetch` gets with `cache: "force-cache"` or `next: { revalidate }`, with or without `next: { tags }`. Two `fetch` calls for the same URL in one render are one request.

Invalidation works as it does in a deployment: `revalidateTag()` and `revalidatePath()` from a Server Action or a route handler, and `updateTag()` and `refresh()` from a Server Action, which is the only place Next allows those two.

Next's server makes an `IncrementalCache` for a request. Here the plugin makes it, and gives it to Next for every request. The class is Next's. So is the handler it picks, the one `next start` uses, which keeps the entries in memory. The options are the ones Next's server passes, without a disk to read or write. Pages and route handlers share one cache.

From `next.config`, `experimental.fetchCacheKeyPrefix` and `cacheMaxMemorySize` apply. With `cacheMaxMemorySize: 0` nothing is cached here, where `next start` still has its disk. The plugin does not load your own `cacheHandler` or `cacheHandlers`.

Every test starts with an empty cache. `cleanup()` forgets the revalidated tags and gives the cache a new key prefix, so no test finds what an earlier one stored. That also holds for a cached function that was still running when its test ended and stores its result afterwards. A cached function that only starts after its test has ended stores its result for the next test.

There is a cache between requests too, so a test can call a cached function itself and share what it computes with the page. Await it before the next request, because a cached function that is still running when a request starts hands that request its cache scope.

Next compares an entry with a revalidation by their timestamps in milliseconds, from `Date.now()`. `vi.useFakeTimers()` stops the clock, and so does `vi.setSystemTime()` on its own. With a stopped clock, a tag that is revalidated in a later request than the one that stored the entry is not newer than the entry, so the entry stays. An entry's age, which `revalidate` uses, is off by the difference from the real clock.

### A Cache Scope Ends At Its First `await`

While a cached function runs, Next keeps a store for it in `AsyncLocalStorage`. That store is how `cookies()` knows to throw inside `unstable_cache`, and how a `fetch` inside it knows not to be cached on its own.

Node carries that store to the code after an `await` in the cached function, and to nothing else. A browser cannot tell the two apart. When code runs after an `await`, nothing says whether it belongs to the cached function or to a component next to it that is rendering in the meantime. So one of the two reads the wrong store. Here the cached function does. Its store lasts for the synchronous part of the function, and after the first `await` the function reads the request's store. The other choice breaks pages that work: if the store were kept until the function is done, a component that renders during a cache miss would read the cache's store, and its `cookies()` would throw.

So inside a function cached with `unstable_cache`, after its first `await`:

- `cookies()` and `headers()` work. In a deployment they throw.
- A nested `unstable_cache` keeps its own result, and so does a `fetch` with `cache: "force-cache"` or `next: { revalidate }`. In a deployment both run again whenever the outer function does. Here, when the outer function runs again because its tag was revalidated, it can get the inner one's old result.

Before the first `await` all of these behave as in a deployment. For a cached function with no cached function or cached `fetch` inside it, what a test sees is correct: its value, whether it ran again, and what invalidates it.

The same rule decides what `redirect()` does in the render after a Server Action. Next exits the action's store for that render, and the plugin keeps it exited for the rest of the request. So a `redirect()` in a component replaces the page, as in a deployment.

## Server Code In The Browser

A browser has a `window`, and a `fetch` that Next has not patched. A browser cannot lose its globals, but a module can be compiled so that it does not see them. That is what happens to the modules of a server layer: your JavaScript and TypeScript source files, and the dependencies Vite pre-bundles.

- `typeof window` is replaced by `"undefined"`. `next build` does the same to the code it compiles for a server, and libraries rely on it to tell a server from a browser. The same goes for `typeof document`, `typeof location`, `typeof localStorage` and `typeof sessionStorage`, which are `"undefined"` on a server without help.
- `fetch`, `Request` and `Response` are the server's, even when they are written as `globalThis.fetch`. So a `fetch` in your server code is the one Next patches: two calls for the same URL in one render are one request. The browser still makes the request, so its rules for a request apply, like CORS.

Apart from `setImmediate` and `clearImmediate`, which become the server's, nothing else is replaced. Code that reads `window.innerWidth` without checking `typeof window` first throws on a server, and reads the browser's `window` here.

A Client Component is a module in two layers. It is told it has no `window` while Next renders it to HTML in `ssr`, and it has one in `browser`.

The `rsc` layer shares its Vite environment with the test, and a test needs the browser. So in that environment these are not server code:

- the test files and setup files from your Vitest config: `test.include` and `test.setupFiles`,
- Vitest, Vite and the `@vitest/*` packages you have installed, and the packages those depend on,
- for [another host](#another-host), its `host.files` and `host.packages`, and what those packages depend on, apart from this plugin and Vite RSC,
- what you list in `browserModules`.

Everything else in that environment is server code, including a module that only a test imports and a file with in-source tests. A component defined in a test file is part of that test file's code, and sees the browser. A test file with `"use client"` is code of the `browser` layer, and so is what it imports.

### `browserModules`

Code checks `typeof window` for one of two reasons, and they need opposite answers here.

- **Role.** The code wants to know whether it is the server side of this app. `@t3-oss/env-core` asks, and only hands out a server variable if the answer is yes. `next-themes` asks, and reads no theme from storage on the server. The answer has to be: you are the server.
- **Capability.** The code wants to know whether there is a DOM it can work on. Testing Library asks before it binds `screen` to `document.body`. The answer has to be the truth: you are in a browser. The exception is a module that also gets by without a DOM. PGlite asks in order to pick how it loads, is told it is not in a browser, and works all the same.

Nothing in the code says which of the two a module means. So every other module in the `rsc` environment gets the first answer, and `browserModules` lists the ones that need the second:

```ts
vitestPluginNext({
  // Glob patterns, relative to the project root. One for a package starts
  // with `**`: files are matched by their real path, which package managers
  // put elsewhere than in `node_modules/<name>` under the root.
  browserModules: ["test/**", "**/node_modules/@testing-library/**"],
});
```

When you need it, as far as this has been tried:

- A source file that is not a test file or a setup file and that checks `typeof window` or `typeof document` before it works on the page. Without an entry it is told it is on a server. The demo has one in `test/`.
- A package that the tests use on the page and that makes the same check first. `@testing-library/dom` is one: without an entry `screen.getByRole()` throws "For queries bound to document.body a global document has to be available".

When you do not:

- A helper or a package that touches `document` without checking first. Only `typeof` is replaced.
- The locators, `userEvent` and `expect.element` from `vitest/browser`, and the rest of Vitest.
- MSW. Vitest leaves it out of pre-bundling, so it is served as it is.
- PGlite, in memory and on IndexedDB. It is told that it is not in a browser, and works all the same.

A package that both the tests and the app use can only get one of the two answers. If it needs both, it cannot be used on both sides. And an entry does not help one of the app's packages that, when told it is on a server, takes a code path only Node.js has.

What this does not cover:

- Everything else a browser has: `navigator`, `self`, `history`, `XMLHttpRequest`, `HTMLElement`, `indexedDB`, `matchMedia`, `requestAnimationFrame`. A library that looks for one of those to tell a browser from a server still finds it.
- Code that looks up a global at runtime: `globalThis.window`, `self.window`, `"window" in globalThis`.
- Code that reads `window` without checking `typeof window` first. On a server that throws a `ReferenceError`. Here it reads the browser's `window`.
- Files that are not JavaScript or TypeScript when Vite loads them, like `.vue` or `.mdx`, and modules that another plugin generates.
- Dependencies in files other than `.js`, `.mjs` and `.cjs`, and a dependency that `optimizeDeps.exclude` leaves out of pre-bundling. Those are served as they are. Vitest leaves out `msw`.
- With `resolve.preserveSymlinks`, Vitest's packages are not recognized.

## Mocks

`vi.mock()` replaces a module in the `rsc` layer, where the test runs. That is the module your Server Components and Server Actions import. The other two layers load their own modules, so a mock does not reach a Client Component. For the same reason a test file with `"use client"` cannot mock: the plugin stops with an error at a `vi.mock()`, `vi.unmock()`, `vi.doMock()` or `vi.hoisted()` in it, which Vitest would hoist out of a file that runs elsewhere.

Mocks of app modules go in a setup file. With `isolate: false` the test files of a worker share their modules, so a module is mocked for all of them or for none, and the file that loads it first decides. A setup file runs before every test file. A bare `vi.mock("./app/lib/weather.ts")` there is enough, and a test says what the mock does with `vi.mocked(getForecast).mockResolvedValue("sunny")`.

In browser mode, Vitest 5.0 has a bug here. It does not wait for a setup file's mocks before it imports a test file, so a test file with no `vi.mock()` of its own gets the real module ([vitest-dev/vitest#11450](https://github.com/vitest-dev/vitest/issues/11450), fixed by [#11520](https://github.com/vitest-dev/vitest/pull/11520) but not released yet). Until a release has the fix, import the mocked module in the setup file after the `vi.mock()` call. This repository patches Vitest instead, see `patches/`.

## The Node.js Runtime

Next has two server runtimes. A route picks one with `export const runtime`, and gets `nodejs` without it. The other one, `edge`, is closer to a browser, but Next has deprecated it: `next build` in 16.4 warns about it, and Cache Components, `"use cache"` and `proxy.ts` only exist for Node.js. So the server layers are compiled for Node.js, for every route. A route that asks for `edge` runs on Node.js too. A run says so once when it starts, and lists the files.

`process.env.NEXT_RUNTIME` is a compile-time constant, and with `nodejs` Next's code takes its Node.js server's branches. Three things differ from `next start`, because a browser has web APIs and no Node.js ones:

- Web streams. `process.env.__NEXT_USE_NODE_STREAMS` is Next's own compile-time switch between `renderToPipeableStream` and `renderToReadableStream`. `getDefineEnv()` turns it on for Node.js, and the plugin turns it off.
- React's builds for web streams: `react-dom/server.edge`, and Vite RSC's Flight codec.
- Next's ESM files, and its route modules as modules. For Node.js Next loads one bundle of its own, `next/dist/compiled/next-server/app-page.runtime`, which includes React for both server layers.

This is what a Node.js server has and a browser does not. The modules are in `node-platform.ts`, the request and the response in `node-server.ts`, and the globals in `globals.ts`:

| What                                                     | Here                                                                                                                                                                                                                                                                                                                                               |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `http.IncomingMessage`, `http.ServerResponse`            | The request is a stream of its body, with the properties Next reads from it. The response is Next's own stand-in for one, `MockedResponse` from `server/lib/mock-request`, which Next uses for the requests it makes to itself. It becomes a `Response` at its first byte. A reader that cancels its body closes it, as a browser that leaves does |
| The manifests in `.next/`                                | `load-manifest.external`, the module Next keeps out of its bundle to read them, answers from memory. The routes manifest is the one Next's build makes, with `generateRoutesManifest()`                                                                                                                                                            |
| A route handler's request handler                        | Next's own, `templates/app-route`, as `next start` calls it: `handler(req, res, ctx)`                                                                                                                                                                                                                                                              |
| A page's request handler                                 | Next's own, `templates/app-page-runtime`, as `next start` calls it: `handler(req, res, ctx)`. It makes the route module in the `rsc` layer, and gets the `ssr` layer's class for it                                                                                                                                                                |
| `node:stream`, `stream/promises`                         | `next/dist/compiled/stream-browserify`, which Next ships, with `Readable.toWeb()` and `fromWeb()` added                                                                                                                                                                                                                                            |
| A Server Action's body: busboy, `decodeReplyFromBusboy`  | Next's busboy on that stream. The parts are collected into a `FormData` for Vite RSC's `decodeReply`                                                                                                                                                                                                                                               |
| `node:crypto`                                            | Web Crypto for random values. A SHA-256 in JavaScript for `createHash`, which Next's cache keys need synchronously. Another algorithm throws                                                                                                                                                                                                       |
| `node:path`                                              | `next/dist/compiled/path-browserify`                                                                                                                                                                                                                                                                                                               |
| `setImmediate`                                           | A function in `registry` that server code is compiled to call. It is not a global, because a library in the page that finds a `setImmediate` uses it, as React's scheduler does. With a global one the playgrounds failed now and then on a React `removeChild`                                                                                    |
| `process.cwd()`, `nextTick()`, `hrtime`, `on()`, `off()` | Added to the `process` of the test                                                                                                                                                                                                                                                                                                                 |
| A `Request` with a Node.js stream as its body            | The server's `Request` takes one, as Node's does                                                                                                                                                                                                                                                                                                   |
| `Buffer#latin1Slice()` and the like, which busboy calls  | On `Uint8Array.prototype`, because every copy of the `Buffer` polyfill is a `Uint8Array`. The page shares that global                                                                                                                                                                                                                              |
| What Next patches when its server starts                 | Left out: `console`, `Date`, `Math.random`, `crypto`, `setImmediate`, the process handlers, the hook on `require`. The globals are the test's too                                                                                                                                                                                                  |

`node:crypto`, `node:stream` and `node:path` are also there for the app's server code, as far as these stand-ins go.

What is still to do here:

- Cache Components and `"use cache"`. Their code is reached only with `cacheComponents`, and it needs what a browser does not have at all: `AsyncLocalStorage` for more than one scope at a time, the order of `process.nextTick` and `setImmediate` in Node's event loop, and Next's patched `Date` and `Math.random`. The stand-in for `fast-set-immediate.external` throws where that code starts.
- Prerendered pages. Next's request handler for a page wraps a render in a build's response cache, and here no page is in that cache. Every request renders its page.
- `instrumentation.ts` and the app's own `cacheHandler`. `load-manifest.external` and its neighbours are where they would go.

## Watch Mode

What follows is an option, and it is off unless `vitestPluginNext({ affectedTests: true })` sets it. Without it, an edit in watch mode runs every test file that opens a route, and `vitest --changed` and `vitest related` do not find a route's test files. With it, they find the test files that loaded the changed file. It is off by default because it relies on Vitest internals, and because the record it keeps between runs has the limits listed below.

It is one addition to the plugin, in `src/nextjs/affected/`, with its own plugin. Only two files know about it: `plugin.ts` lists it, and `rsc.ts` tells it what a test file loads. Its `index.ts` says how to remove it from the code.

Everything that relies on Vitest internals, rather than on something Vitest offers a plugin, is in `affected/vitest.ts` and nowhere else. That is three functions, each documented with what it relies on. `affected/vitest.test.ts` runs them against the real Vitest, so an update that changes one of those internals fails a test.

Vitest finds the test files to rerun in Vite's module graph. It walks from the changed file to what imports it, up to the test files. A test that opens a route with `renderServer({ url })` does not import `page.tsx`. The plugin does, in the modules that list the routes, and every test file ends up importing those. So in the graph every test file imports every route, and an edit to one page would run them all.

The browser knows better, and says so. When the server in the browser loads a route's modules, it calls one of the plugin's browser commands, and Vitest adds the test file that is running. Right before Vitest looks up the test files for a change, the plugin makes the graph say the same (`affected/watch.ts`): the list no longer imports the routes' modules, and a test file imports the modules of the routes it loaded. The lookup is still Vitest's. So a component deep in a page finds that page's test files, and a module that a test file imports itself still finds that test file.

```
app/profile/page.tsx changes
  -> the module of the route /profile       imports it
  -> app/profile/page.test.tsx              loaded that route
```

- **The hook** is `watchTriggerPatterns` in Vitest's config, with a pattern that matches every file and a function that returns nothing. Vitest calls it for a file that changes, before its own lookup.
- **A layout** is among the modules of every route under it, so it runs the test files of all those routes.
- **The module of a Server Action** that no page imports runs the test files that called one of its actions. The browser reports that too.
- **A route that no test file has loaded** runs nothing. A test file that has not run since Vitest started is not picked up either, because what it loads is not known yet.
- **A test file that changes** is forgotten until it has run again.
- **Tailwind** needs separate handling. It registers every file it scans as a dependency of the stylesheet, and Vitest follows that too, so saving any file runs every test file whose page has the stylesheet. `playground/nextjs-notes-demo/test/ignore-watched-only-modules.ts` takes those out with the same hook.

### `vitest --changed` And `vitest related`

These pick the test files for a change before anything has run, so the browser cannot say what they load. Vitest answers from each test file's imports. It transforms the file in the `ssr` environment, follows the imports that are project files, and keeps the test files that reach a changed file. For a Next app that fails in two ways. A test file does not import the page it opens. And the `ssr` environment is none of the three layers. It does not have Next's compiler, so it cannot read an app file that needs it, like a `.js` file with JSX.

A run does know (`affected/related.ts`). When a test file has passed, the files it depends on are in Vite's module graphs. The plugin records them, each with a hash of its contents, in a `vitest-plugin-rsc/related-….json` named after the project, in Vite's cache directory:

- what the test file and the setup files import;
- what the routes it loaded import, and the modules of the Server Actions it called;
- in each layer, since a Client Component has its imports in the browser layer;
- a module's mock, from the `__mocks__` directory next to it;
- what Next reads next to the `app` directory, and what those files import: `next.config`, `tsconfig.json`, `.env` files.

At the next lookup the plugin answers for a test file itself. The test file belongs to the change when one of its files is a changed file, or no longer matches what was recorded. The second condition covers a cache that is older than the checkout: a page that got a new import in a commit without a run. When a test file belongs, the plugin adds it to the list of changed files, because Vitest keeps a test file that is in that list. The test file itself is empty in the `ssr` environment during a lookup, so Vitest follows no import into a file it cannot read.

- **Never too few.** A test file that is not recorded belongs to every change, even one outside the project. The one exception is a change to other test files only, which run on their own account. Not recorded covers a test file that did not pass, one that ran in part (a name pattern, a line, a tag, a bail), and every test file in a checkout without the cache.
- **A file added to or removed from the `app` directory**, or next to it, can change which route a URL gets and which layouts a route has, without a change to a recorded file. Then nothing that is recorded counts.
- **The `ssr` environment is only Vitest's lookup** for a project in browser mode. Vitest's own code and the global setup run in another environment. Vitest's static parse of a test file reads it in `ssr` too, and finds no tests in it during a lookup.
- **Not known:** a test that loads a route only some of the time, like one behind a condition on the date or one that is skipped while it runs. A file that is not a module: one the app reads from disk, or one in `public/`. A file Tailwind scans is not a dependency of a test, though a class in it adds to the stylesheet. And a file that is edited while a run is under way, outside watch mode, because its hash is taken when its test file ends.
- **One lookup at a time.** Vite keeps the empty test file, and the plugin releases it when a run starts. Code that looks up twice without a run in between gets the first answer.

## Another Host

The layers do not import Vitest, so a page that is not Vitest's can host the app: a page of Vite with a dev server, or Storybook's preview. What Vitest's config says of a test runner, the `host` option says of another host: `host.files` are its files, like its stories, which keep the browser's `window` and `fetch` as a test file does, and `host.packages` are its packages, like `storybook`, which the `browser` layer imports from the page instead of a copy of its own. A spy of `storybook/test` in a Client Component is then the one the Actions panel listens to. `host.plugins` names the Vite plugins of the host, like Storybook's, which apply to the `rsc` layer only: a plugin that injects the runtime of the host, or maps its packages to globals of its page, would break the other two. The plugin sets their `applyToEnvironment`, since a host adds some of its plugins after its config.

Vitest is an optional peer dependency of the plugin, of any version, and no file of its build imports Vitest but the setup files that the plugin gives Vitest by their path: a host installs the plugin without Vitest, or next to the Vitest of the project's own tests, which can be another major. Under Vitest the plugin runs in Vitest 5.0.3 or later, and says so in an older one.

A file of `host.files` can be a file of a package in `node_modules`, like a framework of the host. The host leaves such a package out of Vite's pre-bundling, since a file with `"use client"` in a bundle is no longer a module of its own. With a dev server Vite then gives each of its JavaScript modules the version of the dependencies of the environment in the query of its id, `?v=1a2b3c4d`. The plugin takes such a module for its file, in the `rsc` layer for a file with `"use client"` or of `host.ui.files`, and in the `browser` layer for an import of another file of the host, which the page's module of the file stands for. The two layers have a version each, so a module of the page is named by its file. Any other query, like `?raw`, is another module of the file.

A module that stands for a module of the page has an id that does not end in the name of that module. A plugin of the host that compiles files by their name, like the CSF plugin of Storybook, would take it for that file and read it from disk.

Storybook renders a story again when an arg changes. The Storybook framework of the playground does that with `rerender()`, so the canvas keeps the state of the story's Client Components. A story that the page no longer has, like after an error, renders anew, and so does a client story when the globals change: the project's decorators around it render on the server, once per page. A page of the app always loads anew. Storybook also aborts the render of a story that is left while it renders, and reloads the preview when that render has not stopped a few tasks later. So the framework stops waiting for the page as soon as the render is aborted, and its teardown leaves the page that may still be loading.

A route has the stylesheets that Next links, as under Vitest: the page asks the dev server for them, at `/@vitest-plugin-rsc/next-stylesheets`. A node has the CSS of the files of the host that render it, which the host says: the Storybook framework of the playground says the story file and `.storybook/preview`, so a story does not have the CSS of another story file. See [Stylesheets](#stylesheets).

A host can have a UI of its own that renders with React DOM, like the docs pages of Storybook. React in the `rsc` layer, which the host shares, is its react-server build, which has no React DOM. So that UI is code of the `browser` layer, as a file with `"use client"` is. `host.ui.packages` are packages of the host that the `browser` layer loads itself, with its own React, where it otherwise takes a package of the host from the page. `host.ui.files` are the files of such a UI, like MDX docs pages. A page does not load them: in the `rsc` layer each of their exports is a stand-in. `importForHost()` of `vitest-plugin-rsc/nextjs/internal` takes such a stand-in, or an export of a file with `"use client"`, and answers with that export in a module graph of the `browser` layer that lives as long as the document: a page load of the app takes the graph of the pages, and a file with `"use client"` reads from the page that is open, but neither touches this one. A file that the `rsc` layer evaluated again, after a change, is evaluated again in that graph, and with it every module of the app that the graph has, as in a page load: the dev server cannot tell which of them changed. The packages stay, with the host's React. The Storybook framework of the playground renders a docs page there: `DocsRenderer` from a file of the framework, and the page of an MDX file, which Storybook's plugin compiles in the `rsc` layer too, so that the plugin can tell what the file exports. The stories on a docs page each render in an iframe of their own, with the app of that story.

What a package of `host.ui.packages` imports of the other packages of the host is the page's where the `browser` layer resolves the import. A dependency that the `browser` layer pre-bundles has what it imports in the bundle, unless the bundle leaves the import out, as it does for Storybook's own preview modules.

`cleanup()` forgets less outside Vitest. A test runs as a new browser context, so Vitest's `cleanup()` forgets every cookie and storage key that was not there when the plugin loaded. Another host keeps state of its own on the same origin, like the manager of Storybook. There it forgets the cookies the server set, and the cookies and keys added while a page of the app was open. A key that another document of the origin stores, like Storybook's manager or Vitest's UI, is never the app's.

## A Static Build

`vite build` builds the three layers into files of a site, with no server behind it: a page load in the browser fetches the files where it asks a dev server for a module. The `rsc` layer shares its environment with the host, so it is the host's own build, with its HTML. The other two run through a module runner, so that a page load gets a module graph of its own. They are built like any environment, and each file of JavaScript is then rewritten into what a module runner evaluates. That is Vite's transform for a module runner, on the chunks of the build: the plugin's faster transform of pre-bundled dependencies is for a dev server, which a build has none of. A page load fetches what a file imports as soon as it has the file, all at once, as it does with a dev server, and not one file after the other as the runner asks for them.

A Flight payload names a Client Component by an id, so a build has to have every module that an id names, under that id. The order of the builds gives them those ids:

1. the `rsc` layer, only to find the Client Components and the host's files with `"use client"`,
2. the `browser` layer, only to find the modules with Server Actions that only a Client Component imports, and what the host's files import of the page,
3. the `rsc` layer, which gives each Client Component the id it has in a Flight payload,
4. the `browser` and the `ssr` layer, with the modules of those ids.

The first two cut every module down to its imports, so they are quick. The plugin's `buildApp()` hook builds them in that order, so the app is built with Vite's app builder: `vite build`, or `createBuilder()` and `buildApp()`. The config of the plugin has a `builder`, so `createBuilder(config, null)` makes the app builder too. Vite's `build()` builds one environment, the host's, and the plugin stops it with an error before anything is built. `@storybook/builder-vite` calls `build()`. storybookjs/storybook#36690 adds a feature flag to it, `features.viteAppBuilder`, that builds with the app builder instead. Until a release has it, this repository patches `@storybook/builder-vite` with that change, and the Storybook framework of the playground turns the flag on, see `playground/storybook-nextjs-vite-rsc`.

- React is its development build, as in a test run.
- `images.unoptimized` is on: there is no image optimizer behind `/_next/image`.
- A file that Next's loaders emit, a font or an image, and a file of Vite's, like an import with `?url`, are named from the file that asks for them, so the site can be served from any path.
- The CSS of the app is a stylesheet per file under `/_next/static/css/`, which Next links, with the lists of every route and of every file of the host in `vitest-plugin-rsc/next-stylesheets.json`: see [Stylesheets](#stylesheets). Served from another path than the root, Next links it by the way up from `/_next/`, like `/_next/../docs/_next/static/css/page-1a2b3c4d.css`. The CSS that a file of the host imports is Vite's, in the CSS of its chunks.
- The entry of each layer, `vitest-plugin-rsc/<layer>/entry.js`, is not named after its content: the build of the host says where it is, and comes before it. Serve it without a long cache, like `index.html`. The chunks it imports are named after their content.

## Not Yet

- Metadata files like `icon.png` and `sitemap.ts`. The plugin does not run Next's metadata loaders yet. When a run starts, it warns once about the app's metadata files, apart from `favicon.ico`. A page renders without them, and their routes are not served.
- Next's compiler for a package in `node_modules`, apart from a file that names `next/font`. Next also compiles the packages in `transpilePackages`, and a package that uses `next/dynamic`. Here a package is pre-bundled as it is. Not tested.
- A font in a test file. Next's compiler does not run on the test files, so call `next/font` in one of the app's modules. An image that a test file imports is the object Next makes from it.
- A `webpack` function or `turbopack` rules in `next.config`: your own loaders, like `@svgr/webpack` or `@next/mdx`. Also a Babel config, which makes Next compile with Babel.
- `compiler.emotion`. Next's transform gets the option, but Vite compiles JSX, with its own import source, so the `css` prop needs `jsxImportSource` in your tsconfig. Not tested.
- The React Compiler, `reactCompiler` in `next.config`. Components run as they are written.
- Bundle optimizations: `optimizePackageImports`, `modularizeImports`, `experimental.optimizeServerReact`, the browser targets. They do not change what the app does.
- A CommonJS source file in the app, with `require` or `module.exports`. Vite serves source files as ES modules.
- `.env` files, `NEXT_PUBLIC_` variables and `env` in `next.config`. `process.env` in the browser is empty unless a test or a setup file fills it.
- Font preloads. Next puts a `<link rel="preload">` in the HTML for a route's fonts, from a manifest of its build. The fonts load when the CSS asks for them.
- The CSS of a component of `next/dynamic` from Next's manifest of dynamic imports, with `precedence="dynamic"`, next to a preload of its JavaScript. Here it is a stylesheet of the segment that imports the component.
- `experimental.useLightningcss` in `next.config`. Next then compiles CSS with Lightning CSS. Here it is PostCSS, Next's default, so a class of a CSS module has the name of that. A run says so.
- Next's mode of a CSS module, with a PostCSS config that only Vite reads, like `postcss.config.ts`, or with `css.postcss` in the Vitest config. A run says so.
- Sass needs the `sass` package, as it does for Vite, and `sassOptions` in `next.config` does not apply. Not tested.
- In a static build, a URL of a file of `public/` with a query or a fragment that is not in the source of a linked stylesheet itself: in a stylesheet it `@import`s, a Sass partial, a Sass interpolation, or what a PostCSS plugin like Tailwind writes. The build does not name the file there, and the browser asks for `__VITE_PUBLIC_ASSET__…__`, which is not found.
- An asset prefix with its own origin, like a CDN. Stylesheets, font and image files are only served by the dev server, so a page has no CSS.
- The `next.config` headers, and the ones the proxy sets, for a request the app does not answer itself: a file in `public/`, which the dev server serves. Also the `next.config` headers for a request that the proxy answers itself.
- A rewrite, from `next.config` or the proxy, to a path that no route has, like a file in `public/`. The network is asked for the request's URL, not for the rewrite's destination.
- A dynamic route under a folder whose name a URL percent-encodes, like `app/release notes/[id]`. `@next/routing` does not find it. A run warns about it when it starts.
- `i18n` in `next.config`, which belongs to the Pages Router. The app runs as it would without it. An app with `output: "export"` is served like any other, with its proxy and the `next.config` redirects.
- A dynamic segment with a `&` in it, written unencoded. `@next/routing` reads what follows the `&` as a query of the request.
- A request the server makes to itself keeps its request stores until all of its work is done, which can be after its response has arrived: an `after()` callback, or a body that streams on. Code that awaits such a `fetch` reads that request's stores until then. For a proxy that is the rest of the request it runs for.
- What the proxy hands to `waitUntil()` continues after the proxy has returned, without its request stores. Next's `instrumentation.ts` is not run, for the proxy or for a route.
- A route handler does not see the query that a rewrite adds, as with `next start`. Its `request.url` is the URL the browser asked for.
- `basePath`, and `trailingSlash: true`. Both are passed to Next's route resolution, and neither is tested with a page.
- A route with `export const runtime = "edge"` runs on Node.js like the others: see [The Node.js Runtime](#the-nodejs-runtime). Static generation of a `GET` route handler and `revalidate` do not apply, so every request runs the handler. `process.env.NEXT_RUNTIME` is a constant in Next's own code and is not set for the app's code.
- `"use cache"`. Next compiles such a function with the part of its SWC transform that also compiles Server Actions, and Vite RSC does that part here. Compiling it would not be enough either: the function is called after Next has awaited, so it would never read its cache scope's store. `cacheTag()` and `cacheLife()` need that store, and so does collecting the tags of the `fetch` calls in the function. See [Caching](#a-cache-scope-ends-at-its-first-await).
- Inside a function cached with `unstable_cache`, after its first `await`, the request's store is read instead of the cache's. See [Caching](#a-cache-scope-ends-at-its-first-await).
- A `cacheHandler` or `cacheHandlers` in `next.config`. The cache is Next's own, in memory.
- Code that exits a store with `AsyncLocalStorage.exit()` for work that awaits, and reads the store again afterwards. The store stays exited for the rest of the request. Next does this for the render after a Server Action, where nothing reads it again.
- An `after()` callback that takes longer than a second continues without its request's stores, so `cookies()` and `headers()` fail in it from then on. Under `vi.useFakeTimers()` a response without a body never tells Next it was sent, so its `after()` callbacks do not run while the request lasts, and the next request starts a second late.
- A navigation without Next's router to a route handler that does not answer with HTML, like a download link, is an uncaught error, because there is nothing to show. So is a navigation to another origin, like a redirect to a sign-in or a checkout. The test stays where it is.
- Server code is only told it is on a server where it checks `typeof window`: see [Server Code In The Browser](#server-code-in-the-browser).
- A mock for Client Components: see [Mocks](#mocks). And a mock in a test file with `"use client"`.
- One request at a time. A request that waits for another request that the test has not sent yet will wait forever. A response that streams without end, like server-sent events, holds up every request after it.
- A page that the test leaves before the server has sent anything, because the page waits for data outside a Suspense boundary, is not stopped. Its render continues once the data comes, without its request, and Next logs the errors that follow, possibly in a later test.
- A same-origin `fetch` for a path that a dynamic route matches goes to the app, even when it is for a file in `public/`, which a deployment serves before it looks at the routes. With `app/[locale]/page.tsx` that is every one-segment path, like `/data.json`. With a catch-all at the root, like `app/[...slug]`, it is every path.
- A form that is posted without JavaScript, before the page has hydrated. Such a request names its action in the form data and not in a `next-action` header, and the server does not look there. It renders the page and does not run the action.
- A navigation that leaves the page without Next's router, like `location.assign()`, is turned into a page load with the Navigation API, which today means Chromium.
- A timer that the app starts keeps running after its page is left, like the one `next-themes` uses to turn transitions back on. A browser drops it with the page. Here it fires later, and fails if it touches its page's document. A test that ends right after the app loaded a page itself, like the page a node links to, can run into that. Wait for the page to settle first.
- Every `renderServer()` loads React and the app's client code again, as a page load does: the modules are evaluated again. They are fetched from the dev server and compiled once, as a browser keeps them in its HTTP cache, until a file changes. The plugin releases a page when the test leaves it, by removing what React and Next left on `window` and `document` while they loaded. What the app's own code leaves there keeps that page in memory, as in a page that never reloads: a listener on `window`, an interval, a global. The app has to clean those up, as in an effect's cleanup. A page has its own `<body>`, which goes away with the page, and so does a node. So a portal into `document.body` keeps nothing in memory, though React adds its listeners to the body. The browser itself keeps the element that the pointer is over, and with it its page, until the pointer is over another one. If the browser grows too much, use `isolate: true`. Every test file then starts in a new page, and loads the app's server again.
- React is its development build, including in the server layers, while Next takes itself to be a production server. So the client gets the message of an error that a Server Component throws, and `error.tsx` can show it, where a deployment sends a digest and a message that says nothing. Strict Mode also runs an effect twice. A test that reads the text of such an error passes here and not against a deployment.
- A script can read an `HttpOnly` cookie. The plugin keeps the app's cookies in `document.cookie`, where a browser keeps such a cookie to itself. Client code that reads a session cookie works here and not in a browser.
- The browser matches a cookie's `Path` against the test runner's URL, not against the request's URL. A cookie with `Path=/admin` is not sent with a request for `/admin`, and a cookie without a `Path` gets the runner's path.
- Only `fetch` reaches the app. `XMLHttpRequest`, which axios uses by default, `EventSource`, `navigator.sendBeacon()` and an `<img>` with a route handler's URL go to the dev server.
- A `<form method="post">` without a React action is sent as `multipart/form-data`, where a browser sends it URL-encoded. A route handler that reads it with `request.formData()` does not see the difference.
- Opening or leaving a page waits for a request that the server has not answered yet, also one of `handleRequest()`, for five seconds at most. A request that never answers makes every leave that long, and gives a warning.
- In watch mode, a file that shapes a route and that is added while Vitest runs is not seen until Vitest starts again: a new page, `layout`, `loading`, `error`, `not-found` or `default`. Next's route loader keeps a directory's files for as long as the process lives.
- A worker starts slowly, because it loads Next's runtime for three layers before its first test. With as many workers as cores, that first test can time out. `playground/nextjs-notes-demo` sets `maxWorkers: 4` for that.
