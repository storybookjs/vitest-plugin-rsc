# A static build

`vite build` builds your app into a static site. The site contains all three layers, so the server runs in the browser of whoever opens the page, and there's no server behind it. That's what a host that publishes your app's pages needs, such as a deployed Storybook, and the build directory can go to any static host.

The plugin builds with Vite's app builder, as `vite build` does: `await (await createBuilder(config, null)).buildApp()`. Vite's `build()` builds only one environment, so the plugin stops it with an error that says so. The plugin doesn't build in `--watch` mode.

## What differs from the dev server

Everything that runs on the dev server also runs from the build: pages and nodes, Client Components and their references, Server Actions, route handlers, the proxy, cookies, fonts, images and stylesheets. These are the differences.

### Production code

Next's runtime and React are their production builds, as after `next build`:

- A page of the e2e demo's build loads in about 60% of the time of the development build, with about 60% of the bytes, as measured by `pnpm perf:static`.
- A page has no React warnings, no owner stacks, no second `<StrictMode>` render and none of Next's development checks. React's error messages are a number and a link, and the browser gets a Server Component's error as a digest, without its message.
- `build: "development"` builds the development code instead, for a build you want to debug. See the table in [Development Or Production](next-routes.md#development-or-production).
- Neither build has Next's dev overlay, because the plugin doesn't render it.
- Your app's own `process.env.NODE_ENV` matches the build, not `"test"`.

### Images and environment variables

- `images.unoptimized` is on, unless your app has its own image loader, because there's no image optimizer to ask.
- Your app's `process.env` has the variables of `.env.test` and `.env`, which end up in the files of the build, and none of a `.local` file. The build logs the names of the variables it puts in. Keep secrets out of those files: see [Environment Variables](next-routes.md#environment-variables).

### How the code is loaded

The code of the `ssr` layer and of the `browser` layer is one file each, `vitest-plugin-rsc/*/modules.json`. A tab fetches each file once:

- The `browser` layer's file right away. The HTML of a host page starts that fetch with a preload.
- The `ssr` layer's file when the page imports `vitest-plugin-rsc/nextjs/testing-library`, or with the first request that Next's server handles. A page that only imports `vitest-plugin-rsc/nextjs/client-components` and sends the app no request never fetches it.

A request of the host's own that your proxy's matcher matches, like a request for a host file, is a request to the app too, so the proxy runs on it.

The preload uses the browser's default cache mode, so the `no-cache` header [below](#serving-the-build) is what makes the browser check whether its copy is current. The names of the `modules.json` files don't change with their content, and neither does the name of `vitest-plugin-rsc/next-files.json`, so serve these files like `index.html`. Serve them compressed, too: the two layers are 1.5 MB of JavaScript in production and 3 MB in development.

### Stylesheets

- Next links a route's CSS as it does with a dev server: one file per stylesheet under `/_next/static/css/`. `vitest-plugin-rsc/next-files.json` lists the stylesheets of every route and every host file, and the modules of every route. A page load starts loading its route's modules right away, together with its stylesheets.
- A node gets the CSS of the host files that the host names as rendering it (`hostFiles` of `renderServer()`), as with a dev server. In a build, the host files are whatever `host.files` matches, because there's no Vitest config to say so.
- `experimental.inlineCss` isn't honoured in a build: the stylesheets are linked.

### Paths

- The build's files refer to each other by relative paths. To serve the build from a subpath, build it with that `base`, or with `base: "./"`.
- The plugin puts no paths of your machine into the build:
  - A route's files are named from the project root (`app/layout.tsx`), and so are the Next config paths in the layers, like `configFile`, and the files that a compile error quotes.
  - So the same source tree builds into the same files, byte for byte, in another directory or on another machine, and their content hashes hold.
  - Paths that your app puts in itself stay, like a path in `env` of `next.config`.
  - A source map (with `build.sourcemap`) names its sources by their path relative to the map, as Vite names them.

### Host files and packages

- A host file with `"use client"`, like a file the host renders, runs in the `browser` layer, as with a dev server. Its stylesheets come from `next-files.json`. It runs once for the document, because a build has one module of the file.
- The `ssr` layer has the Client Components that server code reaches: the ones your routes render, and the ones that a host file without the directive imports, which can render them in a node. A file with the directive that only the host's runtime imports (a module that isn't a file of `host.files`) belongs to the `browser` layer alone, so the `ssr` layer's file doesn't carry it, or anything only it imports. See [how a static build works](next-routes.md#a-static-build) in the internals.
- The host's packages (`host.packages`) are the page's own in the build, too. The `browser` layer imports them from the host's build, so the host and its files with the directive share one instance, like the spies of a host's testing package.
- A host with its own pages, like `index.html` and `callout.html` in `build.rolldownOptions.input`, gets them built as its pages. The layers build their own entries.

## Serving the build

A static host should serve the build with these headers, chosen by the path of the file in the build directory:

- `cache-control: no-cache` and an `ETag` for `index.html` and the host's other pages, `vitest-plugin-rsc/*/modules.json`, `vitest-plugin-rsc/next-files.json`, and any other file without a content hash in its name, like a file in `public/`. The browser asks again for a file whose name stays the same from build to build, and the server answers with a 304 when the browser's copy is current.
- `cache-control: public, max-age=31536000, immutable` for `assets/`, `_next/static/` and `vitest-plugin-rsc/*/assets/`. Their names contain a content hash, so the browser keeps them without asking.
- Compressed, with brotli for a browser that accepts it.

`pnpm perf:static` serves its builds this way.

## Without Next.js

`vitestPluginRSC()` on its own builds the same way. It builds its two layers from a project page that calls `renderServer()` from `vitest-plugin-rsc/testing-library`, and Server Components, Client Components, Server Actions and the CSS of both run from the build, with React's production code. See [A Static Build](architecture.md#a-static-build) and `playground/rsc-vitest-demo`.

## Examples

`playground/nextjs-e2e-demo` builds its app with three pages of its own:

- `index.html`, which calls `renderServer()` as a test does.
- `client.html`, which renders a Client Component with `loadClientModule()`.
- `example.html`, whose own module script does the same.

A test project opens the build in a browser from a file server: see its `build-test/`. `playground/nextjs-host-demo` builds its two pages the same way, with its host files that have `"use client"` and a host package, and opens them in its own `build-test/`.

`pnpm perf:static` measures what one page load of the e2e demo's build costs per route, in bytes, requests, round trips and time. It measures both builds, on localhost and over an emulated network: see [docs/performance.md](performance.md#a-static-build-per-page-load).
