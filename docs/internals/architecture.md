# Architecture

This page describes `vitestPluginRSC()` on its own: how the `renderServer` of `vitest-plugin-rsc/testing-library` renders a Server Component, and how `vite build` builds it into a static site. A Next.js app runs on the same two environments and a third one, see [next-routes.md](next-routes.md).

`renderServer` runs the same React Server Components protocol your app uses in production:

1. Render the server tree to a React Flight stream.
2. Read that Flight stream on the client.
3. Resolve any Client Component references.
4. Render the final React tree into the browser DOM.

The transport is the only unusual part. In production, the browser fetches the Flight stream from a server endpoint. In this plugin, the stream is passed between Vite environments inside the Vitest browser runtime.

## Two Vite Environments

The plugin creates two environments:

1. `client` is the RSC environment. It uses the `react-server` condition and the RSC transform, so Server Components render correctly and `"use client"` modules become references.
2. `react_client` is the browser/client environment. It loads Client Components with browser conditions and renders the deserialized tree into the DOM.

At the center is the same serialize/deserialize pair React uses for RSC:

```tsx
import { renderToReadableStream } from "@vitejs/plugin-rsc/react/rsc";

// Imported through a helper, so Vite resolves it in react_client.
const { createFromReadableStream } = await importReactClient("@vitejs/plugin-rsc/react/browser");

const flightStream = renderToReadableStream(<ServerComponent />);
const jsx = await createFromReadableStream(flightStream);
```

## Client References

When the RSC transform sees a Client Component:

```tsx
"use client";
import { useState } from "react";

export function Like() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(count + 1)}>Like {count}</button>;
}
```

it does not execute that component in the RSC environment. It turns the export into a client reference:

```tsx
import { registerClientReference } from "@vitejs/plugin-rsc/vendor/react-server-dom/server";

export const Like = registerClientReference(
  /* fallback */,
  "file:///my-app/components/like.tsx",
  "Like",
);
```

Later, when React reads the Flight stream, it asks for that reference. `importReactClient` is a Vite `ModuleRunner` import function:

```tsx
const runner = new ModuleRunner({
  transport: {
    invoke: invokeReactClient,
  },
});

export const importReactClient = runner.import.bind(runner);
```

## The Websocket Bridge

When the runner needs a module, it calls `transport.invoke(payload)`. This plugin forwards that invoke over a dedicated Vite websocket:

```tsx
async function invokeReactClient(payload) {
  const id = nextId();

  socket.send(
    JSON.stringify({
      type: "custom",
      event: "vitest-plugin-rsc:react-client:invoke",
      data: { id, environment: "react_client", payload },
    }),
  );

  return waitForInvokeResult(id);
}
```

On the Vite server, the websocket message is handled by the environment it names. Without Next.js that is always `react_client`:

```tsx
server.ws.on("connection", (socket) => {
  socket.on("message", async (raw) => {
    const invoke = parseWebSocketInvoke(raw);
    if (!invoke) return;

    const environment = server.environments[invoke.environment];
    const result = await environment.hot.handleInvoke(invoke.payload);

    socket.send(
      JSON.stringify({
        type: "custom",
        event: "vitest-plugin-rsc:react-client:invoke-result",
        data: { id: invoke.id, result },
      }),
    );
  });
});
```

That is the key bridge. The test is rendering a Server Component, but when React needs a Client Component, Vite resolves it with the browser/client conditions it would have in the app.

A plugin answers the page over the same socket with `answerPage()` (`src/page-bridge.ts`), and the page asks with `askDevServer()` (`src/utils.ts`): the Next.js plugin does so for the stylesheets of a route, once while its modules stay. A round trip of the socket is a fraction of one of HTTP. The page asks through its host (`src/page-host.ts`): the socket in a browser (`src/browser-host.ts`), and in a worker of Node.js without Browser Mode, where Vitest has no socket, a listener of HTTP of the plugin's own, with the same table of answers (`src/node-host.ts`).

A module in `react_client` that Vite imports its client (`/@vite/client`) into gets the page's own instance of it, not a copy with a second HMR websocket (`src/vite-client.ts`).

With Next.js every `renderServer()` is a page load, with a new runner for the browser layer: its modules are evaluated again. Vite's runner sends an invoke for every import of every module, also for a module it already has. It sends them one after the other, each once the module before it has run, which is hundreds of round trips in a row for one page. So the page fetches the modules itself (`src/utils.ts`). With a module, the server says what that module imports, and the page asks for all of those at once. It keeps the answers for the runner, and for the runner of the next page, and compiles a module once. The server layer of a Next.js app, which a tab loads once, gets its modules the same way.

The version of the modules of an environment is when Vite last invalidated one of them, as it does for a file that changed while the tests run, and for the modules that import it; a page that sees another version fetches its modules again. Every invalidation goes through the graph's `invalidateModule()`, also the one of Vitest's watcher, which calls the graph without a hook of a plugin, and the optimizer's: the server hears of it there, and tells every page in the microtask after, before any answer it makes after the change (`onInvalidation()` in `src/module-versions.ts`, `tellPages()` in `src/page-bridge.ts`). In fidelity mode a page load that the test opens asks for the versions, along with its request, and one that the app loads itself as its page starts, as a browser asks for a page; with the speed feature `cacheDevServer` the page asks once as a test file starts and takes the news after that. A runner that outlives page loads, like the graph of the files with `"use client"` of the Next.js plugin, asks before it catches up, and so does the page after its socket closed: an answer comes after every change the server made before it, also one that reached the server through another connection, like a request of the test or Vite's HMR. Within a page, the page reads what the server told it since (`heardVersions` in `src/utils.ts`), and its requests ask nothing: the Next.js plugin keeps the stylesheets of a route and of the files of the host for as long as the versions stay, and in fast mode leaves the kept app before the first page that the test opens after the page heard of a change of the browser layer's modules, which would otherwise run next to the new ones. The host of the page brings the news in order with its answers (`listen()` in `src/page-host.ts`): a page in a browser hears it on its socket, next to the answers; a page in a worker of Node.js, whose answers come over HTTP, on a stream of its own, and an answer, which says how many pieces of news the server told before it, waits for those (see The Node Host). Without the news, the first answer would hold for the whole page. The graph of the files with `"use client"` then asks which modules Vite invalidated after its version, and evaluates those again. The server layer has modules of before the change by then. Its runner asks the dev server about every module it loads from then on, as Vite's runner does, until Vitest runs the tests again in a new tab.

In an environment that the page runs through a module runner, a dependency comes without its source map. Vite puts the source map in the module, and for the pre-bundled dependencies of an app that is megabytes, more than their code. Combining those source maps is also what takes the dev server longest when it first compiles a dependency for a runner. An error in a dependency is reported at its place in the code that the page runs, under the name of the file, and the source maps of the app's own files are as they were. This goes for `react_client` without Next.js too.

Vite also compiles every pre-bundled dependency again for a module runner, in every run: it turns the file into a syntax tree in JavaScript, megabytes for a package like an icon set, and walks it to rewrite its imports and exports. That was most of what the dev server did while a page loaded for the first time in a run. Rolldown, which Vite comes with, does that step natively, about ten times as fast and off the main thread, but Vite does not use it yet. So for a pre-bundled file the plugin runs Vite's plugins as Vite does, then Rolldown's `moduleRunnerTransform` in place of Vite's own, and gives Vite the result as the one it has for the module (`src/dependency-transforms.ts`). The files of the app are Vite's to compile. One thing differs from Vite's transform: in a cycle of imports, a module that reads an export before the module that has it defined it gets `undefined` from Vite's, and a `ReferenceError` from Rolldown's. A browser throws too, except for a function that a module exports from another module. Without Rolldown's transform, or when it fails on a file, Vite compiles the file as it always did.

## The Node Host

Without Browser Mode, in a project of Vitest with `environment: "happy-dom"` or `"jsdom"`, the page runs in a worker of Node.js, with that DOM, and the plugin is its host (`src/node-host.ts`, chosen in `configureVitest` of `src/index.ts` as `virtual:vitest-plugin-rsc/page-host`). No module of the page tells the two hosts apart: what a DOM of Node.js lacks, the host gives it.

- **The transport.** The plugin's own listener of HTTP on the loopback, with the table of answers of the socket (`src/page-bridge.ts`), and Node's `http`, not the page's `fetch`, which a test can mock. It answers a question only with its own host and JSON, as Vite's socket answers only with its token: not a page of another site.
- **The news.** What the dev server tells the page unasked, like a change of its modules, which a page in a browser hears on its socket, the page in Node.js hears on a stream of the listener, a line of JSON for each piece (`pageNewsPath` in `src/page-protocol.ts`), opened before its first request and again after one closed, when the page asks for the versions again. Every answer of the listener says how many pieces the server had told as it sent it, and the host holds it until it heard those: so an answer of a module after a change comes after the news of the change, as on one socket.
- **The web APIs.** Node's `Request`, `Response`, `Headers` and `fetch` for the page and the server, kept before the DOM replaces them (`src/worker-web-apis.ts`, with `--import`); the DOM keeps its `FormData`, `Blob` and `AbortController`, which the host turns into Node's for a request. The server code makes its `AbortController` and `AbortSignal` with the runtime's, as Bun's native streams take no other signal.
- **Bun.** With happy-dom, Next's server pipes its responses with the runtime's signals (above), which Bun's streams need. With jsdom it does not start: Vitest's environment of jsdom fails as it sets up, before the plugin, at jsdom's check that `window.addEventListener` is called on its own window (`'addEventListener' called on an object that is not a valid instance of EventTarget`, in Vitest's `catchWindowErrors`). That is Bun's and jsdom's, upstream.
- **The realm.** Vitest's environment of jsdom puts the typed arrays and `ArrayBuffer` of jsdom's realm on the global, where Node's `Buffer`, `TextEncoder` and `crypto` make the worker's, which fail the `instanceof Uint8Array` of Next's server: the host puts the worker's back (`src/node-dom.ts`). happy-dom has the worker's.
- **Boxes.** jsdom's `Range` has no `getClientRects()`, which React asks a fragment for as Next's router scrolls to a new page: the host gives it the answer of jsdom's elements, no boxes; and jsdom has no `matchMedia`, which a library like next-themes asks as it renders: the host's matches no query (`src/node-dom.ts`).
- **The navigations.** A stand-in of the Navigation API's `navigate` events, for a click on a link, the submit of a form, `location` and `history` (`src/navigation-shim.ts`).
- **Stylesheets.** A DOM of Node.js loads none, so the document does not wait for them; jsdom has no constructed stylesheets, so its `adoptedStyleSheets` is a list that keeps what it is given (`src/node-dom.ts`).
- **The pre-bundles.** Vitest turns off the optimizer of every environment without Browser Mode; the page's environments are a browser's, whose dependencies are bundled with their conditions, so the host keeps each one's own, in a `cacheDir` of its own, and the worker starts once their first bundling is done. No environment bundles `vitest`, and Vitest's cache of compiled modules on disk has the version of the pre-bundles in its key (`defineCacheKeyGenerator()`).
- **Timers.** React's scheduler uses `setImmediate` in Node.js, which the page's timers cover (`src/timers.ts`).

A worker runs its test files one after the other in one DOM, with `isolate: false`: one Vite dev server for the run, in Vitest's process, and one listener on it; in the worker, the server layers load once, in the setup file, and a database of the page, like PGlite in the notes benchmark, is created once and emptied before each test.

It is no faster and no lighter than Chromium. On the notes benchmark's dom-locators column, in fast mode and production, Vitest on Node.js, with 1 worker, on an M1 Pro, 3 runs each after a warmup: Chromium 15.96 ± 0.18 s, happy-dom 16.70 ± 0.32 s, 1.5 ms more a test, jsdom 27.12 ± 1.77 s, 22 ms more. What a DOM of Node.js saves of Chromium's native work, React's writes of the DOM, style, layout and paint, about 4 ms a test, it spends in its own JavaScript, about 4.5 ms a test in happy-dom and 17 in jsdom, and the HTML of a page load is parsed on the thread of the server. The peak memory of the run's processes is 1.7 GB with Chromium, 2.2 GB with happy-dom and 2.1 GB with jsdom. With 4 workers, Chromium and happy-dom both run 2.2 times as fast as with 1, and each worker adds about 0.7 GB with Chromium and 1.2 GB with happy-dom, a process of Node.js that holds the page, the server, the database and the DOM. Measured on #267.

### What a DOM of Node.js does otherwise than a browser

What passes in Chromium and may not in a DOM of Node.js, and why. The notes benchmark's dom-locators column skips the tests that a known gap fails, by name (`knownGaps` of its `vitest.config.ts`).

- **Layout.** Nothing is laid out: every box is empty, nothing is on top of anything. dom-locators tells what is visible by the style alone, and a click lands on the element itself, also under an overlay. In jsdom no media query matches, where happy-dom evaluates one against its window.
- **CSS.** No stylesheet that the document links is loaded, so a rule of the app's CSS, like `display: none`, hides nothing; happy-dom applies a `<style>` of the document, jsdom some of it. No `new CSSStyleSheet()` in jsdom.
- **Navigations.** No document is ever loaded: a link or a form to another document is a `navigate` event that the plugin takes, or nothing. Not heard: `form.submit()`, which fires no event, a traversal of the history, and in jsdom `location.assign()`, `replace()`, `reload()` and `href`, which are unforgeable, as a browser's; jsdom keeps the document and tells nobody.
- **The fetch API.** The page's `fetch`, `Request`, `Response` and `Headers` are Node's, its `FormData`, `Blob` and `File` the DOM's. A request takes a body of the DOM's, but `new Response()` of a `Blob` or a `FormData` of the DOM's has a text like `[object Blob]` for a body, and what a response reads, like `formData()` or `blob()`, is Node's, no `instanceof` of the page's. jsdom has no `Response` to read a body of its own with: a `Blob` for a body, or a file in a form, throws. Node's `fetch` knows no CORS, so a page gets the answer of another origin that a browser would block, and keeps no cookies of an origin other than the app's.
- **Frames.** happy-dom calls a callback of `requestAnimationFrame` on the next turn of the event loop, not once a frame; jsdom every 16 ms, with `pretendToBeVisual`, which Vitest's environment sets.
- **Coverage.** Vitest's coverage with V8 in a worker of Node.js reports what Node.js runs by the URL of a file: not the modules that the page's runners evaluate, its client components among them, which in a browser the plugin maps.
- **Events.** An event of dom-locators or Testing Library is the page's own: `isTrusted` is `false`, and no default action of the browser follows but the DOM's, like a click on a submit button.
- **happy-dom's `<output>`.** Its default value is `""`, where the HTML spec's is the element's text unless a script set one, so a form's `reset()`, which React does after a form's action, empties an `<output>` in the form: the error of the notes app's sign-in form. 4 of the 500 tests of the benchmark. A fix of two lines in happy-dom; the plugin cannot correct it without its private symbol, which `reset()` reads.

### What it takes of Vitest

- `configureVitest`, `TestProject.provide()` with `inject()`, `defineCacheKeyGenerator()` and `project.config`: public.
- `expect.element()` of dom-locators (`dom-locators/expect-element`) reads the flags `negate` and `_name` of Vitest's chai assertion, as Vitest's own does, sets `_poll.element` for Vitest's messages, and, for the test's time left, the running test of `__vitest_worker__`, the global of Vitest's worker. No public way: Vitest's `expect.element()` is Browser Mode's alone.
- The optimizer of the page's environments, which the host puts back after Vitest's `configEnvironment` hook (`vitest:environments-module-runner`, `order: "post"`) set it to Vitest's, with a plugin of its own with `enforce: "post"`. Without Browser Mode Vitest gives every environment its config of a runner of Node.js, also one that Vitest never runs, like the page's `react_client`, rsc and ssr layers; with Browser Mode it leaves them as they are. Its public option, `test.deps.optimizer.<environment>`, turns discovery off and excludes `react`, which the rsc layer has to bundle with `react-server`. What would make this public: Vitest leaves an environment alone that it does not run, as it does in Browser Mode, or an option that says so.

## A Static Build

`vite build` builds the two environments into a static site, with no dev server behind it (`src/static-build.ts`). A page of the project hosts the Server Components, as a test file does: its `index.html`, with a script that calls `initialize()` and `renderServer()` of `vitest-plugin-rsc/testing-library`. `playground/rsc-vitest-demo` has one, `host/main.tsx`, and a test project that opens its build in a browser, `build-test/`. It builds with Vite's app builder, as `vite build` does: Vite's `build()` builds one environment, so the plugin stops it with an error, and it does not build in `--watch` mode.

- **`client`** is the host's build: Vite builds `index.html` and its scripts, the Server Components among them, as for any page, also its CSS, which the HTML links.
- **`react_client`** is built as an environment of its own, from the client of the testing library, and every chunk is rewritten for the module runner. They are one file, `vitest-plugin-rsc/react_client/modules.json`, by the id of each chunk, which a tab fetches once, before the file of any other layer, from a preload in the HTML of the host's page (`src/built-layers.ts`). Besides the client of the testing library, the layer has the list of its client references as an entry, `references.js`, by which a runner outside a page can evaluate a Client Component by its key: `vitestPluginNext()` does so for a file of the host with `"use client"`. The CSS of a Client Component is a file of the build, which Vite loads with the chunk of the component, as it does for any dynamic import.

Vite's app builder builds them in an order that gives every reference its id: `client`, to find the `"use client"` files, then `react_client`, as a scan for the `"use server"` files that only a Client Component imports, then `client` again and `react_client` with every reference. With a dev server the id of a reference is the one Vite imports the module by. In a build Vite RSC names it with a hash of its path, so each environment gets a list of the modules a payload can refer to by that id: `virtual:vitest-plugin-rsc/client-references` in `react_client`, and `virtual:vitest-plugin-rsc/server-references` in `client`. With a dev server both are `undefined`.

A file of the layers names another one by the way from itself: where the plugin's code needs the directory of the build, it has a placeholder, which becomes the relative path from the chunk to the directory once the chunk has its place. The files of the host's own build, like the scripts of `index.html`, are named by Vite, from `base`: to serve the build from a path, build it with that `base`, or with `base: "./"`. `vite build` builds React's production code, as for any app. There is no option for the development code without Next.js. The variables that an inline Server Action keeps are encrypted with one key, not a new one for every build, so `__vite_rsc_encryption_key.js` is the same in every build: the server is the page, which has the key anyway.

Next.js builds the same way, with its ssr layer as one more environment for the module runner: see [A Static Build](next-routes.md#a-static-build).

## The Full Loop

1. `renderServer(<ServerComponent />)` renders the server tree to a Flight stream.
2. The Flight client calls `importReactClient(...)` when it needs browser/client modules.
3. `importReactClient` sends Vite ModuleRunner invokes over websocket.
4. Vite resolves those invokes in the `react_client` environment.
5. The browser receives the result, deserializes the Flight stream, and Testing Library renders it into the DOM.
6. Browser interactions can call Server Actions, fetch a new Flight payload, and rerender.
