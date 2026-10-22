# API reference

```ts
import {
  cleanup,
  handleRequest,
  newBrowserContext,
  renderServer,
  runInServerAction,
} from "vitest-plugin-rsc/nextjs/testing-library";
import {
  keepHostDocument,
  linkStylesheetsOf,
  loadClientModule,
} from "vitest-plugin-rsc/nextjs/client-components";
import { vitestPluginNext } from "vitest-plugin-rsc/nextjs/plugin";
import { vitestPluginRSC } from "vitest-plugin-rsc";
```

For React Server Components without Next.js, see [RSC without Next.js](rsc-without-nextjs.md).

## Entry points

The two runtime entry points differ in what they load:

- **`vitest-plugin-rsc/nextjs/testing-library`** is the server's API. Importing it starts loading the layers of Next's server, so your first page doesn't have to wait for them.
- **`vitest-plugin-rsc/nextjs/client-components`** is for a host that renders Client Components from its own files and doesn't use the server's API, like a framework's renderer. Importing it loads none of Next's server layers.

Outside your app's browser context, the document has the browser's own `fetch`, cookies and storage. A host opens a context with `newBrowserContext()` before it seeds anything for a page, and `cleanup()` closes it. `renderServer()`, `handleRequest()` and `runInServerAction()` open one when none is open. A host that renders Client Components of its own outside a context calls `keepHostDocument()` while it does, so that a link or a form in a component doesn't unload the host's document.

## `renderServer({ url, headers, proxy, signal })`

Opens a route. It resolves with `{ response, errors, unmount }` once the page has hydrated.

- `response` is the server's `Response` to the document request.
- `errors` holds what React reported on the page during and after rendering, in order: a render that threw, an error that an error boundary caught, a Server Action that threw. A render that throws still resolves, with Next's error page, and its error is in `errors`.
- `unmount()` leaves the page.

`proxy` defaults to `true` for a route, and a route always renders inside your app's layouts. To render a page without them, pass it as a node: `renderServer(<Page />, { url })`. See [Open a whole route](nextjs-guide.md#open-a-whole-route).

## `renderServer(<Node />, options)`

Renders a node in a container, on a route of its own. Every option is optional:

| Option        | What it does                                                                                                                                                                                                                    |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `url`         | The request URL. Defaults to `/`. The params are the ones your app's route has for it.                                                                                                                                          |
| `headers`     | Request headers, on top of the ones a browser sends. They're sent with every request, not only the first. A `cookie` header sets cookies for your app.                                                                          |
| `wrapper`     | A component that wraps the node on the server. It can be a Server Component.                                                                                                                                                    |
| `proxy`       | `true` runs `proxy.ts` and the `next.config` routing for the request, as for a route. Defaults to `false`.                                                                                                                      |
| `layouts`     | `true` renders the node in place of the page at `url`, inside your app's layouts. The root layout renders the document, so `container` and `baseElement` can't be passed, and `container` is the `<body>`. Defaults to `false`. |
| `container`   | An empty element for the node. Defaults to a new `<div>` in `baseElement`, which `cleanup()` removes.                                                                                                                           |
| `baseElement` | Defaults to `container` if you pass one, otherwise `document.body`.                                                                                                                                                             |
| `signal`      | An `AbortSignal`, which works for a route too. When it aborts, the page load stops, the page is left, and the render rejects, as `fetch` does.                                                                                  |

A node has the CSS of whatever its test file and the setup files import. A host other than Vitest passes one more option, `hostFiles`: the host files that render the node, for their CSS. A Vitest test never passes it. See [Another Host Than Vitest](next-routes.md#another-host-than-vitest).

A node resolves with `{ container, baseElement, asFragment, rerender, unmount, response, errors }`.

### `rerender(ui)`

`rerender(ui)` renders another node in its place without a page load, so its Client Components keep their state. It sends one request through Next's router, like the one `router.refresh()` sends, with the same `wrapper`, `url` and `headers`, and every call is a separate request. It resolves once React has committed the new node and run its effects. It rejects when something else took the node's place, like an error page (with a `NodeReplacedError`), or when the page was left. See [Rendering The Node Again](next-routes.md#rendering-the-node-again).

```tsx
const { rerender } = await renderServer(<Greeting name="Ada" />);
await page.getByRole("button", { name: "Count: 0" }).click();

await rerender(<Greeting name="Grace" />);
// "Hello Grace", and the counter still says "Count: 1".
```

## `handleRequest(input, init)`

Sends one request to your app, like `fetch`, and resolves with the `Response`. See [Route handlers](nextjs-guide.md#route-handlers).

## `runInServerAction(fn, options)`

Runs `fn` as a Server Action of the page at `url`, without opening a page. The options are `url`, `proxy` and `headers`. See [Code that a Server Action calls](nextjs-guide.md#code-that-a-server-action-calls).

## `cleanup({ url })`

Leaves the page and closes your app's browser context, with its cookies and storage. It also clears the cache and unlinks the CSS of the host's files. After it, the document has the browser's own APIs again. The plugin runs it around every test. For another host, `url` is the URL the document has afterwards.

## `newBrowserContext()`

Leaves the page, as `cleanup()` does, and opens a new, empty browser context for your app: until `cleanup()`, the document has your app's cookies, storage, requests and navigations. The plugin runs it before every test of a file without `"use client"`. Another host calls it before whatever seeds a page.

## `vitest-plugin-rsc/nextjs/client-components`

These are for a host other than Vitest. See [Another Host Than Vitest](next-routes.md#another-host-than-vitest).

- **`keepHostDocument(report)`**: for a host that renders Client Components outside the app's browser context. It stops a link or a form that would load another document, and `report` hears its URL (by default, an error goes to `reportError()`). A declared download is left to the browser. It returns a function that stops it.
- **`loadClientModule(module)`**: resolves with the exports of a host file with `"use client"` from the `browser` layer, for the module the host imported, with a dev server and in a static build. The file runs once per version: again after a change to it or to what it imports. A file that imports it gets the same evaluation. Other modules come back as they are.
- **`linkStylesheetsOf(files, { signal })`**: links the CSS of host files and of what they import (in the `browser` layer, for a file with `"use client"`) while the host uses them, until `signal` aborts or `cleanup()` runs. It takes the files in the same form as `hostFiles` of a node. Loading a file links nothing.

## `vitestPluginNext(options)`

The Vite plugin for Next.js. Put it after `vitestPluginRSC()` in the plugins: Vite RSC makes the client reference of a test file with `"use client"` among the plugins that run last, and `vitestPluginNext()` puts its line in front of that reference, so it has to come after. Before `vitestPluginRSC()`, it throws. All options are optional:

| Option           | What it does                                                                                                                                                                                                                                               |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `browserModules` | Glob patterns, relative to the project root, of modules that have to know they run in a browser. See [Server code in the browser](nextjs-guide.md#server-code-in-the-browser).                                                                             |
| `build`          | Experimental. `"production"` runs Next and React as `next start` does: faster, and without their warnings. Defaults to `"development"`, and to `"production"` for `vite build`. See [Development Or Production](next-routes.md#development-or-production). |
| `host`           | For a host other than Vitest: its `files` and `packages`. See [Another Host Than Vitest](next-routes.md#another-host-than-vitest).                                                                                                                         |
