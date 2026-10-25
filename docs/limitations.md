# Limitations

The plugin runs Next's real runtime, but in a browser tab instead of on a server. Most of the time you won't notice. This page lists the times you might.

Looking for every edge case, with the reason behind it? See [Not Yet](internals/next-routes.md#not-yet) in the internals, and the [conformance report](internals/next-conformance.md) for every Next.js e2e test that doesn't pass.

## Because it's a browser tab

- **No native addons.** `better-sqlite3`, `sharp`, `bcrypt` and friends don't load. Use a JavaScript or WebAssembly alternative (like `bcryptjs`), or mock the module that imports them.
- **No TCP sockets.** Database drivers can't reach a server. Use a [database recipe](databases.md) instead, or MSW for HTTP APIs.
- **Some Node.js functions throw.** The plugin has stand-ins for most of what servers use, and throws a clear error for the rest. See [Node.js in the browser](nodejs-in-the-browser.md).
- **Only `fetch` reaches your app.** `XMLHttpRequest` (axios's default), `EventSource`, `navigator.sendBeacon()` and an `<img>` pointing at a route handler go to the dev server instead. Without Browser Mode, with happy-dom, an asynchronous `XMLHttpRequest` and the resources the page loads reach it too.
- **No `cookieStore`.** Code that uses the Cookie Store API without checking for it fails.
- **Spy on `localStorage`, not `Storage.prototype`.** Your app's storage is the plugin's own object, so a spy on the prototype sees nothing.

## One request at a time

- **No `test.concurrent`.** Tests in a file run one after another, because concurrent tests would share Next's request context. Test files still run in parallel.
- **Requests are handled one by one.** A request that waits for another request the test hasn't sent yet waits forever. A response that streams endlessly, like server-sent events, blocks everything after it.
- **Slow `after()` callbacks lose their context.** After a second, `cookies()` and `headers()` stop working in them.

## Development vs. production

- **React runs its development build by default.** Errors thrown by Server Components show their message on the client, where a deployment shows a digest. Strict Mode also runs effects twice. Set [`build: "production"`](nextjs-guide.md#development-or-production) to behave like a deployment.
- **Prerendering happens on the first request**, not before the tests. The static shell of a page with Cache Components isn't prerendered.

## Next.js features that aren't supported (yet)

- `ImageResponse` from `next/og`, as used by `opengraph-image.tsx`. The page still links the image, but the image route fails.
- The React Compiler (`reactCompiler`).
- Most of a custom `webpack` function. Rules with a `test` and loaders in `use` (like `@next/mdx`) work, and so do aliases. Anything fancier doesn't, and neither do `turbopack` rules or a Babel config.
- `compiler.emotion` needs `jsxImportSource` in your tsconfig. Not tested.
- `experimental.useLightningcss`: CSS is compiled with PostCSS, Next's default.
- Bundle optimizations like `optimizePackageImports` and `modularizeImports`. They don't change what your app does.
- `instrumentation.ts` doesn't run.
- `i18n` from the Pages Router is ignored.
- An asset prefix on another origin, like a CDN.
- `basePath` and `trailingSlash: true` are passed to Next's routing, but aren't tested with a page.
- `export const runtime = "edge"` routes run on the Node.js runtime like every other route.
- Cached Navigations, and some less common shapes of `"use cache"`. See [`"use cache"`](internals/next-routes.md#use-cache).

## Routing edge cases

- A dynamic route under a folder whose name gets percent-encoded, like `app/release notes/[id]`, isn't found. The plugin warns about it at startup.
- A dynamic segment with an unencoded `&` in it.
- A rewrite to a path that no route has (like a file in `public/`).
- `next.config` headers on files from `public/`.
- A rewrite to another server doesn't carry your app's cookies.
- A same-origin `fetch` for a path that a dynamic route matches goes to your app, even if a file in `public/` has that path.

## Navigation edge cases

- **Leaving the app is an error.** A redirect to another origin (a sign-in provider, a checkout) is an uncaught error, and the test stays put.
- **Navigating to a route handler that returns JSON** without Next's router is an uncaught error too. Downloads do work.
- **`location.assign()` and friends** use the Navigation API, which today means Chromium.

## `"use client"` test files

- No Next router, no Server Actions and no `vi.mock()`. See [Testing Client Components](use-client-test-files.md).

## Watch mode

- A new `page`, `layout`, `loading`, `error`, `not-found` or `default` file added while Vitest runs isn't picked up until you restart Vitest.
- `vitest --changed` and `vitest related` find a test by the URL it passes to `renderServer()` or `handleRequest()`. Not by where the proxy sends that URL, by a rule of `next.config` that depends on a header or a cookie of the test, or by where the test navigates from there. See [Watch mode](nextjs-guide.md#watch-mode).

## Memory

- Each `renderServer()` loads your client code again, like a page load. Things your app leaves on `window`, like a global listener it never removes, keep that page in memory. If the browser grows too much, try `isolate: true`: every test file then starts in a fresh page, at the cost of loading your app's server again.
