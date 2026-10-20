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

A plugin answers the page over the same socket with `answerPage()` (`src/websocket-bridge.ts`), and the page asks with `askDevServer()` (`src/utils.ts`): the Next.js plugin does so for the stylesheets of a route, which every page load asks for. A round trip of the socket is a fraction of one of HTTP.

A module in `react_client` that Vite imports its client (`/@vite/client`) into gets the page's own instance of it, not a copy with a second HMR websocket (`src/vite-client.ts`).

With Next.js every `renderServer()` is a page load, with a new runner for the browser layer: its modules are evaluated again. Vite's runner sends an invoke for every import of every module, also for a module it already has. It sends them one after the other, each once the module before it has run, which is hundreds of round trips in a row for one page. So the page fetches the modules itself (`src/utils.ts`). With a module, the server says what that module imports, and the page asks for all of those at once. It keeps the answers for the runner, and for the runner of the next page, and compiles a module once. The server layer of a Next.js app, which a tab loads once, gets its modules the same way.

The version of the modules of an environment is when Vite last invalidated one of them, as it does for a file that changed while the tests run, and for the modules that import it. A page load starts by asking for that version, and a page that sees another one fetches its modules again. A runner that outlives a page load, like the graph of the files with `"use client"` of the Next.js plugin, asks which modules Vite invalidated after its version, and evaluates those again. The server layer has modules of before the change by then. Its runner asks the dev server about every module it loads from then on, as Vite's runner does, until Vitest runs the tests again in a new tab.

In an environment that the page runs through a module runner, a dependency comes without its source map. Vite puts the source map in the module, and for the pre-bundled dependencies of an app that is megabytes, more than their code. Combining those source maps is also what takes the dev server longest when it first compiles a dependency for a runner. An error in a dependency is reported at its place in the code that the page runs, under the name of the file, and the source maps of the app's own files are as they were. This goes for `react_client` without Next.js too.

Vite also compiles every pre-bundled dependency again for a module runner, in every run: it turns the file into a syntax tree in JavaScript, megabytes for a package like an icon set, and walks it to rewrite its imports and exports. That was most of what the dev server did while a page loaded for the first time in a run. Rolldown, which Vite comes with, does that step natively, about ten times as fast and off the main thread, but Vite does not use it yet. So for a pre-bundled file the plugin runs Vite's plugins as Vite does, then Rolldown's `moduleRunnerTransform` in place of Vite's own, and gives Vite the result as the one it has for the module (`src/dependency-transforms.ts`). The files of the app are Vite's to compile. One thing differs from Vite's transform: in a cycle of imports, a module that reads an export before the module that has it defined it gets `undefined` from Vite's, and a `ReferenceError` from Rolldown's. A browser throws too, except for a function that a module exports from another module. Without Rolldown's transform, or when it fails on a file, Vite compiles the file as it always did.

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
