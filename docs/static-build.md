# Static builds

`vite build` turns your app into a static site. All three of Next's layers go in, so the "server" runs in the browser of whoever opens the page. No server needed.

Why would you want that? For a host that publishes your app's pages, like a deployed Storybook. The output directory can go on any static host.

The plugin builds with Vite's app builder, like `vite build` does:

```ts
await (await createBuilder(config, null)).buildApp();
```

Vite's plain `build()` only builds one environment, so the plugin stops it with an error. `--watch` mode isn't supported.

## What's different from the dev server

Everything that runs on the dev server runs from a build too: pages, nodes, Client Components, Server Actions, route handlers, the proxy, cookies, fonts, images and stylesheets. The differences:

### It's production code

Next and React use their production builds, like after `next build`:

- **Faster and smaller.** A page of the e2e demo loads in about 60% of the time, with about 60% of the bytes (measured with `pnpm perf:static`).
- **No dev extras.** No React warnings, no owner stacks, no double `<StrictMode>` render, no Next dev checks and no dev overlay.
- **Production errors.** A Server Component's error reaches the browser as a digest, without its message.
- **`process.env.NODE_ENV`** matches the build, not `"test"`.

Need to debug a build? `build: "development"` builds the development code instead.

### Images and environment variables

- `images.unoptimized` is on (unless you have your own image loader), since there's no image optimizer to ask.
- `process.env` gets the variables from `.env.test` and `.env`, never from a `.local` file. The build logs which names it includes.

> [!WARNING]
> Those values end up in the files of the build. Keep secrets out of `.env.test` and `.env`.

### Paths

- Files refer to each other by relative paths. To serve from a subpath, build with that `base`, or with `base: "./"`.
- No paths from your machine end up in the build. The same source builds into byte-for-byte the same files anywhere.

### Stylesheets

Next links a route's CSS just like with a dev server: one file per stylesheet under `/_next/static/css/`. One exception: `experimental.inlineCss` is ignored, so stylesheets are always linked.

## Serving the build

Set these headers on your static host, based on the file's path in the build:

| Files                                                                                                                                        | Headers                                              |
| -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `assets/`, `_next/static/`, `vitest-plugin-rsc/*/assets/`                                                                                    | `cache-control: public, max-age=31536000, immutable` |
| Everything else: `index.html` and other pages, `vitest-plugin-rsc/*/modules.json`, `vitest-plugin-rsc/next-files.json`, files from `public/` | `cache-control: no-cache`, plus an `ETag`            |

And compress everything, with brotli where the browser accepts it.

Why? Files in the first group have a content hash in their name, so browsers can keep them forever. Files in the second group keep the same name from build to build, so the browser should check for a new version (and get a quick 304 when there isn't one).

Compression matters here: the `modules.json` files hold the code of the server layers, about 1.5 MB of JavaScript in production and 3 MB in development.

`pnpm perf:static` serves its builds exactly this way.

## For hosts

If you're building a host (like a component workshop) that ships its own pages alongside the app:

- **Pages of your own**, like `index.html` and `callout.html` in `build.rolldownOptions.input`, get built as your pages. The layers build their own entries.
- **Host files with `"use client"`** run in the `browser` layer, just like with the dev server, once per document.
- **Host packages** (`host.packages`) are shared between your host and its `"use client"` files, so a testing package's spies are one instance.
- **Code loading**: each layer's code is one file, `vitest-plugin-rsc/*/modules.json`. The `browser` layer's loads right away. The `ssr` layer's loads only when the page imports `vitest-plugin-rsc/nextjs/testing-library` or sends a request to the app. A page that only uses `vitest-plugin-rsc/nextjs/client-components` never fetches it.
- **The proxy runs** on any request of yours that its matcher matches.
- **A node's CSS** comes from the host files that render it (`hostFiles`). In a build, that's whatever `host.files` matches.

The nitty-gritty is in [A Static Build](internals/next-routes.md#a-static-build) and [Another Host Than Vitest](internals/next-routes.md#another-host-than-vitest).

## Without Next.js

`vitestPluginRSC()` on its own builds the same way: from a project page that calls `renderServer()` from `vitest-plugin-rsc/testing-library`. Server Components, Client Components, Server Actions and CSS all run from the build, on React's production code. See [A Static Build](internals/architecture.md#a-static-build) and `playground/rsc-vitest-demo`.

## Examples

`playground/nextjs-e2e-demo` builds its app with three pages of its own:

- `index.html` calls `renderServer()`, like a test does.
- `client.html` renders a Client Component with `loadClientModule()`.
- `example.html` does the same from its own module script.

Its `build-test/` opens the build in a browser from a file server. `playground/nextjs-host-demo` does the same for a host with `"use client"` files and a host package.

`pnpm perf:static` measures the cost of loading one page from the build, per route: bytes, requests, round trips and time. See [the benchmarks](internals/performance.md#a-static-build-per-page-load).
