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
| A page's request handler                     | `next/dist/build/templates/edge-ssr-app`, expanded by Next        |
| A route handler's route module               | `next-app-loader` again, which expands `templates/app-route`      |
| A route handler's request handler            | `next/dist/build/templates/edge-app-route`, expanded by Next      |
| Compile-time constants                       | `getDefineEnv()`                                                  |
| Module aliases, per layer                    | `createWebpackAliases()` and the other alias tables               |
| React                                        | The React that Next ships, through `createVendoredReactAliases()` |

Everything behind those is Next's runtime, unchanged: `handler(Request)` returns the `Response` a deployment would send.

## Three Layers, Three Environments

Next compiles an App Router app into three layers. Each has its own module graph and its own build of React:

| Layer     | Runs                                              | React                | Vite environment |
| --------- | ------------------------------------------------- | -------------------- | ---------------- |
| `rsc`     | Server Components, Server Actions, route handlers | `react-server` build | `client`         |
| `ssr`     | The request handler of a page, the HTML renderer  | regular build        | `next_ssr`       |
| `browser` | Next's router, your Client Components             | regular build        | `react_client`   |

Each layer is a Vite environment here, with the aliases and constants Next gives that layer. All three run in the test's tab. That is what keeps the test white-box: the `db` your test seeds is the module instance the Server Component reads.

Where Next's bundler config moves a module to another layer, the plugin does the same. The route module is created by the `rsc` layer but belongs to `ssr`. The route's request handler is in `ssr` and imports the page from `rsc`. Client Components load once for `ssr`, to render HTML, and once for `browser`. A route handler is `rsc` as a whole: its `route.ts`, its route module and its request handler.

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
- **`fetch`**, so that Next patches the server's `fetch`, not the page's.
- **`AsyncLocalStorage`**. A browser cannot carry a store across `await`. Requests are handled one at a time, and the store a request entered first stays readable until the request ends.
- **`Buffer`**, **`process`**, and the Node modules an edge runtime has.

And for the browser side, a page load: the tab cannot navigate away from the test, so the server's document is moved into the test's document as it streams, its inline scripts are run in order, and the URL is set with the History API.

## Not Yet

- `next/font`, `next/image` optimization, and metadata files like `icon.png` and `sitemap.ts`. These are build-time loaders that still have to be ported.
- `middleware.ts` / `proxy.ts`, and the redirects, rewrites and headers of `next.config`.
- Route handlers run as they do on Next's edge runtime, also the ones a deployment runs on Node.js. The params of the dynamic segments are in the query of `request.url` too, where they replace a query parameter of the same name. Static generation of a `GET` handler and `revalidate` do not apply: every request runs the handler.
- A `new Response()` in your own `route.ts` is the browser's, which drops a `Set-Cookie` header. Set cookies with `cookies()` or `NextResponse`, which keep it.
- `"use cache"` and `unstable_cache`. The store a request entered first is the one a later task reads, so code that resumes after an `await` inside a cache scope reads the request's store instead of the cache's.
- `fetch` in your own server code is the browser's `fetch`, without Next's cache options. A `fetch` there to a route of the app itself never answers: it waits in line behind the request that is waiting for it. And `typeof window` is `"object"` there: only Next's own server code is compiled as server code.
- An `after()` callback that takes longer than a second goes on without the stores of its request, so `cookies()` and `headers()` fail in it from then on. Under `vi.useFakeTimers()` a response without a body never tells Next it was sent, so its `after()` callbacks do not run while the request lasts, and the next request starts a second late.
- A navigation without Next's router to a route handler that does not answer with HTML, like a download link, is an uncaught error: there is nothing for the tab to show.
- `vi.mock()` replaces a module in the `rsc` layer, where the test runs. The other two layers load their modules themselves, so a mock does not reach a Client Component.
- One request at a time. A request that waits for another one that the test has not sent yet will wait forever. A response that streams without end, like server-sent events, holds up every request after it.
- A same-origin `fetch` for a path that a dynamic route matches goes to the app, also when it is for a file in `public/`, which a deployment serves before it looks at the routes. With `app/[locale]/page.tsx` that is every path of one segment, like `/data.json`. With a catch-all at the root, like `app/[...slug]`, it is every path.
- A navigation that leaves the page without Next's router, like `location.assign()`, is turned into a page load with the Navigation API, which today means Chromium.
- Every `renderServer()` loads React and the app's client code again, as a page load does. The listeners React adds to the document stay, so a tab that visits thousands of pages grows.
