# Whole Next.js Routes

`vitest-plugin-rsc/next` runs a Next.js App Router app in the test's browser tab: the server that answers a request, the HTML it renders, and the client that hydrates it. This page explains how, and what it does not do yet.

It is experimental and needs `next@16.4` or later.

## The Idea: Port The Build, Run The Runtime

Next.js is two things. A build, written for webpack and Turbopack, that turns `app/` into bundles. And a runtime, in `next/dist`, that those bundles run on: the request handler, the renderer, the router, the caches.

Only the build is tied to a bundler. So this plugin does the build with Vite, and asks Next's own build code for everything that is not bundling:

| What                                         | Where it comes from                                               |
| -------------------------------------------- | ----------------------------------------------------------------- |
| The routes of the app                        | `next/dist/build/route-discovery`                                 |
| A route's loader tree: page, layouts, errors | `next-app-loader`, Next's webpack loader, called as-is            |
| A route's request handler                    | `next/dist/build/templates/edge-ssr-app`, expanded by Next        |
| Compile-time constants                       | `getDefineEnv()`                                                  |
| Module aliases, per layer                    | `createWebpackAliases()` and the other alias tables               |
| React                                        | The React that Next ships, through `createVendoredReactAliases()` |

Everything behind those is Next's runtime, unchanged: `handler(Request)` returns the `Response` a deployment would send.

## Three Layers, Three Environments

Next compiles an App Router app into three layers. Each has its own module graph and its own build of React:

| Layer     | Runs                                   | React                | Vite environment |
| --------- | -------------------------------------- | -------------------- | ---------------- |
| `rsc`     | Server Components, Server Actions      | `react-server` build | `client`         |
| `ssr`     | The request handler, the HTML renderer | regular build        | `next_ssr`       |
| `browser` | Next's router, your Client Components  | regular build        | `react_client`   |

Each layer is a Vite environment here, with the aliases and constants Next gives that layer. All three run in the test's tab. That is what keeps the test white-box: the `db` your test seeds is the module instance the Server Component reads.

Where Next's bundler config moves a module to another layer, the plugin does the same. The route module is created by the `rsc` layer but belongs to `ssr`. The route's request handler is in `ssr` and imports the page from `rsc`. Client Components load once for `ssr`, to render HTML, and once for `browser`.

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
browser  the HTML goes into the document   as it streams in
         Next's client entry hydrates it   in a module graph of its own, like a page load
```

With a node, `renderServer(<Node />, { url })`, the request is the same one. The only difference is in the route's loader tree: where Next loads the page module of that route, it gets a component that returns the node. Layouts, params, cookies and the router are the route's own. What Next reads off the page module besides its component is gone with it: `generateMetadata`, `metadata`, `viewport`, and segment config like `dynamic`.

After that, Next's router is in charge. A `<Link>` navigation is an RSC request to the same handler. A Server Action is a `POST` with a `Next-Action` header.

## What Stands In For A Server

The server layers are written for an edge runtime, which is close to a browser: web streams, `fetch`, `crypto`. The plugin adds the rest of that platform:

- **`Request` and `Response`** that keep `Cookie` and `Set-Cookie`, which a browser drops from its own.
- **`fetch`**, so that Next patches the server's `fetch`, not the page's. Both reach the same network.
- **`AsyncLocalStorage`**. A browser cannot carry a store across `await`. Requests are handled one at a time, and the store a request entered first stays readable until the request ends.
- **`Buffer`**, **`process`**, and the Node modules an edge runtime has.

And for the browser side, a page load: the tab cannot navigate away from the test, so the server's document is moved into the test's document as it streams, its inline scripts are run in order, and the URL is set with the History API.

## Server Code In A Tab

A tab has a `window`, and a `fetch` that knows nothing of Next's cache. Server code must see neither. A tab cannot lose its globals, but a module can be compiled not to see them, so that is what happens to every module of a server layer:

- `window`, `document`, `location`, `localStorage` and `sessionStorage` are `undefined`. They become variables of the module, which nothing assigns. So `typeof window` is `"undefined"`, which is how libraries tell a server from a browser, and `window.innerWidth` throws.
- `fetch`, `Request` and `Response` are the server's, also when they are written `globalThis.fetch`. A `fetch` with `cache` or `next: { tags }` goes through Next.

This is the tab's version of what `next build` does, which replaces `typeof window` in the bundles it makes for a server. It applies to your source files and to the dependencies Vite pre-bundles, in both server layers. A Client Component is a module of two layers: it has no `window` while Next renders it to HTML in `ssr`, and has one in `browser`.

The `rsc` layer shares its Vite environment with the test, and a test needs the tab. So in that environment these are not server code:

- the test files and setup files of your Vitest config: `test.include` and `test.setupFiles`,
- Vitest and Vite, and the packages they depend on,
- what you list in `testModules`: a helper that reads `document.cookie`, or a package the test runs in the tab.

```ts
vitestPluginNext({
  // Glob patterns, relative to the project root.
  testModules: ["test/**", "**/node_modules/@electric-sql/pglite/**"],
});
```

Everything else in that environment is server code, including a module that only a test imports. A component that is defined in a test file is code of that test file, and sees the tab.

What this does not cover:

- Code that looks a global up at runtime: `self.window`, `"window" in globalThis`, a `globalThis` that is passed to a function. `navigator` is left alone, since servers have one too, so it is the browser's.
- Reading `window` where there is none throws a `ReferenceError` on a server. Here it gives `undefined`: `window.innerWidth` throws a `TypeError`, and `if (window)` is false where a server would throw.
- A dependency that is left out of pre-bundling with `optimizeDeps.exclude` is served as it is.
- The text of a function is not changed, on purpose. `next-themes` sends its theme script to the browser as `` `(${script.toString()})()` ``, and there it has to find the tab's `document`.

## Not Yet

- `next/font`, `next/image` optimization, and metadata files like `icon.png` and `sitemap.ts`. These are build-time loaders that still have to be ported.
- Route handlers (`route.ts`), `middleware.ts` / `proxy.ts`, and the redirects, rewrites and headers of `next.config`.
- `"use cache"` and `unstable_cache`. The store a request entered first is the one a later task reads, so code that resumes after an `await` inside a cache scope reads the request's store instead of the cache's.
- Next's `fetch` cache within one render only. A `fetch` with `cache: "force-cache"` is deduped while a page renders. Whether its result is kept for the next request, and when a test starts without it, is not settled.
- Hiding the tab from server code has gaps: see [Server Code In A Tab](#server-code-in-a-tab).
- `vi.mock()` replaces a module in the `rsc` layer, where the test runs. The other two layers load their modules themselves, so a mock does not reach a Client Component.
- One request at a time. A request that waits for another one that the test has not sent yet will wait forever.
- A same-origin `fetch` is only the app's when Next's router or a Server Action sends it. Other requests go to the dev server.
- A navigation that leaves the page without Next's router, like `location.assign()`, is turned into a page load with the Navigation API, which today means Chromium.
- Every `renderServer()` loads React and the app's client code again, as a page load does. The listeners React adds to the document stay, so a tab that visits thousands of pages grows.
