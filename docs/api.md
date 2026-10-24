# API reference

```ts
// What your tests use
import {
  renderServer,
  handleRequest,
  runInServerAction,
  cleanup,
  newBrowserContext,
} from "vitest-plugin-rsc/nextjs/testing-library";

// The Vite plugins
import { vitestPluginRSC } from "vitest-plugin-rsc";
import { vitestPluginNext } from "vitest-plugin-rsc/nextjs/plugin";

// Only for hosts other than Vitest
import {
  keepHostDocument,
  linkStylesheetsOf,
  loadClientModule,
} from "vitest-plugin-rsc/nextjs/client-components";
```

Using RSC without Next.js? See [RSC without Next.js](rsc-without-nextjs.md).

## `renderServer({ url, headers, proxy, signal })`

Opens a route, like a browser would. Resolves once the page has hydrated, with:

- `response`: the server's `Response` to the document request.
- `errors`: everything React reported on the page, in order. A render that threw, an error an error boundary caught, a Server Action that threw. A render that throws still resolves (with Next's error page), so check here.
- `unmount()`: leaves the page.

A route always renders in its layouts, and `proxy` defaults to `true`. To render a page _without_ its layouts, pass it as a node: `renderServer(<Page />, { url })`.

Guide: [Open a whole route](nextjs-guide.md#open-a-whole-route).

## `renderServer(<Node />, options)`

Renders one node in a container, on a route of its own. All options are optional:

| Option        | What it does                                                                                                                                                                                                             |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `url`         | The request URL. Defaults to `/`. Route params come from your app's route for it.                                                                                                                                        |
| `headers`     | Extra request headers, sent with every later request too. A `cookie` header sets cookies for your app.                                                                                                                   |
| `wrapper`     | A component to wrap the node in, on the server. Can be a Server Component.                                                                                                                                               |
| `proxy`       | `true` runs `proxy.ts` and the `next.config` routing, like for a route. Defaults to `false`.                                                                                                                             |
| `layouts`     | `true` renders the node in place of the page at `url`, inside your layouts. The root layout then owns the document, so `container` is the `<body>` and you can't pass `container` or `baseElement`. Defaults to `false`. |
| `container`   | An empty element to render into. Defaults to a new `<div>` in `baseElement`, which `cleanup()` removes.                                                                                                                  |
| `baseElement` | Defaults to `container` if you pass one, otherwise `document.body`.                                                                                                                                                      |
| `signal`      | An `AbortSignal`. Works for routes too. When it aborts, the load stops, the page is left, and the render rejects, like `fetch`.                                                                                          |

Resolves with `{ container, baseElement, asFragment, rerender, unmount, response, errors }`.

A node gets the CSS that its test file and setup files import. (Hosts other than Vitest pass one more option, `hostFiles`, for the CSS of their own files. See [Another Host Than Vitest](internals/next-routes.md#another-host-than-vitest).)

Guide: [Render a component](nextjs-guide.md#render-a-component).

### `rerender(ui)`

Renders a new node in place, without a page load, so Client Components keep their state. Under the hood it sends one request through Next's router, like `router.refresh()`, with the same `wrapper`, `url` and `headers`.

```tsx
const { rerender } = await renderServer(<Greeting name="Ada" />);
await page.getByRole("button", { name: "Count: 0" }).click();

await rerender(<Greeting name="Grace" />);
// "Hello Grace", and the counter still says "Count: 1".
```

Resolves once React has committed the new node and run its effects. Rejects with a `NodeReplacedError` if something else took the node's place (an error page, say), or if the page was left.

## `handleRequest(input, init)`

Sends one request to your app, just like `fetch`, and resolves with the `Response`. It carries your app's cookies, unless you pass a `cookie` header.

Guide: [Route handlers](nextjs-guide.md#route-handlers).

## `runInServerAction(fn, { url, proxy, headers })`

Runs `fn` as a Server Action of the page at `url`, without opening a page. Resolves with what `fn` returns, or rejects with what it throws, including `redirect()` and `notFound()`.

Guide: [Code that a Server Action calls](nextjs-guide.md#code-that-a-server-action-calls).

## `cleanup({ url })`

Leaves the page and closes your app's browser context: cookies, storage, cache and the CSS of host files all go. Afterwards the document has the browser's own APIs again.

The plugin runs this around every test, so you rarely need it. For another host, `url` is the URL the document has afterwards.

## `newBrowserContext()`

Leaves the page (like `cleanup()`) and opens a fresh, empty browser context for your app. Until the next `cleanup()`, the document has your app's cookies, storage, requests and navigations.

The plugin runs this before every test in a file without `"use client"`. `renderServer()`, `handleRequest()` and `runInServerAction()` open one themselves if none is open. Another host calls it before seeding anything for a page.

## `vitestPluginNext(options)`

The Vite plugin for Next.js. **It must come after `vitestPluginRSC()`** in `plugins`, and throws if it doesn't. All options are optional:

| Option           | What it does                                                                                                                                                                                                                                                               |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `browserModules` | Globs, from the project root, of modules that need to know they're in a browser. See [Server code in the browser](nextjs-guide.md#server-code-in-the-browser).                                                                                                             |
| `build`          | Experimental. `"production"` runs Next and React like `next start`. Defaults to `"development"`, and to `"production"` for `vite build`. See [Development or production](nextjs-guide.md#development-or-production).                                                       |
| `host`           | For a host other than Vitest: its `files` and `packages`. See [Another Host Than Vitest](internals/next-routes.md#another-host-than-vitest).                                                                                                                               |
| `mode`           | Experimental. `"fidelity"`, the default, gives up nothing for speed; `"fast"`, [fast mode](nextjs-guide.md#fast-mode), turns on every speed feature below, for a quick feedback loop. In a test run of Vitest, defaults to `VITEST_PLUGIN_RSC_MODE`, `fast` or `fidelity`. |
| `keepApp`        | Experimental speed feature. The pages of a test file render in one app, without HTML from the server.                                                                                                                                                                      |
| `skipPrefetch`   | Experimental speed feature. `<Link>` and `<Form>` prefetch nothing.                                                                                                                                                                                                        |
| `immediates`     | Experimental speed feature. No delay between the steps of a render on the server.                                                                                                                                                                                          |
| `watchDom`       | Experimental speed feature. `expect.element()` looks again on every change of the DOM.                                                                                                                                                                                     |
| `cacheDevServer` | Experimental speed feature. The dev server is asked about a test file's files once per file.                                                                                                                                                                               |
| `fastCrypto`     | Experimental speed feature. Password hashes cost microseconds. See [Fast crypto](nodejs-in-the-browser.md#fast-crypto).                                                                                                                                                    |

A speed feature you set, `true` or `false`, overrides the mode, like `{ mode: "fast", fastCrypto: false }`. One you don't set is on in fast mode and off in fidelity mode. See [Fast mode](nextjs-guide.md#fast-mode).

## For hosts other than Vitest

`vitest-plugin-rsc/nextjs/client-components` is for a host that renders Client Components from its own files, like a component workshop. Unlike `testing-library`, importing it loads none of Next's server layers. (Importing `testing-library` starts loading them right away, so your first page doesn't wait.)

- **`keepHostDocument(report)`**: while a host renders its own Client Components outside the app's browser context, this stops a link or form from unloading the host's document. `report` gets the URL (by default an error goes to `reportError()`). Downloads are left alone. Returns a function that stops it.
- **`loadClientModule(module)`**: resolves with the exports of a host file with `"use client"`, from the `browser` layer. Works with a dev server and in a static build. The file runs once per version. Other modules come back as they are.
- **`linkStylesheetsOf(files, { signal })`**: links the CSS of host files and their imports, until `signal` aborts or `cleanup()` runs. Takes files in the same form as `hostFiles`.

The full story: [Another Host Than Vitest](internals/next-routes.md#another-host-than-vitest).
