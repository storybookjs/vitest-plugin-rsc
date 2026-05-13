# Architecture

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
      data: { id, payload },
    }),
  );

  return waitForInvokeResult(id);
}
```

On the Vite server, the websocket message is handled by `react_client`:

```tsx
server.ws.on("connection", (socket) => {
  socket.on("message", async (raw) => {
    const invoke = parseWebSocketInvoke(raw);
    if (!invoke) return;

    const result = await server.environments["react_client"]!.hot.handleInvoke(invoke.payload);

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

## The Full Loop

1. `renderServer(<ServerComponent />)` renders the server tree to a Flight stream.
2. The Flight client calls `importReactClient(...)` when it needs browser/client modules.
3. `importReactClient` sends Vite ModuleRunner invokes over websocket.
4. Vite resolves those invokes in the `react_client` environment.
5. The browser receives the result, deserializes the Flight stream, and Testing Library renders it into the DOM.
6. Browser interactions can call Server Actions, fetch a new Flight payload, and rerender.
