# Architecture

This page describes `vitestPluginRSC()` on its own: how the `renderServer` of `vitest-plugin-rsc/testing-library` renders a Server Component. A Next.js app runs on the same two environments and a third one, see [next-routes.md](next-routes.md).

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

A module in `react_client` that Vite imports its client (`/@vite/client`) into gets the page's own instance of it, not a copy with a second HMR websocket (`src/vite-client.ts`).

With Next.js every `renderServer()` is a page load, with a new runner for the browser layer: its modules are evaluated again. Vite's runner sends an invoke for every import of every module, also for a module it already has. It sends them one after the other, each once the module before it has run, which is hundreds of round trips in a row for one page. So the page fetches the modules itself (`src/utils.ts`). With a module, the server says what that module imports, and the page asks for all of those at once. It keeps the answers for the runner, and for the runner of the next page, and compiles a module once. The server layer of a Next.js app, which a tab loads once, gets its modules the same way.

The server counts the modules it invalidates, for a file that changed while the tests run. A page load starts by asking for that count, and a page that sees another count fetches its modules again. The server layer has modules of before the change by then. Its runner asks the dev server about every module it loads from then on, as Vite's runner does, until Vitest runs the tests again in a new tab.

In an environment that the page runs through a module runner, a dependency comes without its source map. Vite puts the source map in the module, and for the pre-bundled dependencies of an app that is megabytes, more than their code. Combining those source maps is also what takes the dev server longest when it first compiles a dependency for a runner. An error in a dependency is reported at its place in the code that the page runs, under the name of the file, and the source maps of the app's own files are as they were. This goes for `react_client` without Next.js too.

Vite also compiles every pre-bundled dependency again for a module runner, in every run: it turns the file into a syntax tree in JavaScript, megabytes for a package like an icon set, and walks it to rewrite its imports and exports. That was most of what the dev server did while a page loaded for the first time in a run. Rolldown, which Vite comes with, does that step natively, about ten times as fast and off the main thread, but Vite does not use it yet. So for a pre-bundled file the plugin runs Vite's plugins as Vite does, then Rolldown's `moduleRunnerTransform` in place of Vite's own, and gives Vite the result as the one it has for the module (`src/dependency-transforms.ts`). The files of the app are Vite's to compile. One thing differs from Vite's transform: in a cycle of imports, a module that reads an export before the module that has it defined it gets `undefined` from Vite's, and a `ReferenceError` from Rolldown's. A browser throws too, except for a function that a module exports from another module. Without Rolldown's transform, or when it fails on a file, Vite compiles the file as it always did.

## The Full Loop

1. `renderServer(<ServerComponent />)` renders the server tree to a Flight stream.
2. The Flight client calls `importReactClient(...)` when it needs browser/client modules.
3. `importReactClient` sends Vite ModuleRunner invokes over websocket.
4. Vite resolves those invokes in the `react_client` environment.
5. The browser receives the result, deserializes the Flight stream, and Testing Library renders it into the DOM.
6. Browser interactions can call Server Actions, fetch a new Flight payload, and rerender.
