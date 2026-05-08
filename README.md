# vitest-plugin-rsc

> Render React Server Components in Vitest Browser Mode.

[![npm version](https://img.shields.io/npm/v/vitest-plugin-rsc?color=cb3837)](https://www.npmjs.com/package/vitest-plugin-rsc)
[![CI](https://github.com/storybookjs/vitest-plugin-rsc/actions/workflows/ci.yml/badge.svg)](https://github.com/storybookjs/vitest-plugin-rsc/actions/workflows/ci.yml)
[![License](https://img.shields.io/npm/l/vitest-plugin-rsc)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D24-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-11-F69220?logo=pnpm&logoColor=white)](https://pnpm.io/)

`vitest-plugin-rsc` runs the RSC side of your component test in Vitest Browser Mode. The Server Component still goes through the RSC transform and Flight serialization, but it executes in the same browser test runtime as your assertions.

That is a test-runtime choice, not a production recommendation. It unlocks a test shape that is hard to get from either unit tests or E2E tests alone:

**DB -> RSC -> browser -> action -> DB -> pixels. One slice at a time.**

Pick one piece of the app, such as a wishlist button, notes form, account menu, or settings panel. Seed exactly the state that slice needs, render the Server Component, interact with the hydrated UI in a real browser, run Server Actions, and assert the rerendered result.

## Why This Exists

Most RSC tests fall into an awkward gap:

- A unit test gives you control over data, mocks, time, and module state, but it usually does not cross the RSC boundary.
- An end-to-end test crosses the real app boundary, but the server is a black box. Seeding state, mocking IO, faking clocks, and covering edge cases all need external setup machinery.

`vitest-plugin-rsc` gives you a middle shape: **full-stack behavior for one vertical slice, with white-box test control**.

Your assertions can stay user-facing:

```ts
await expect.element(page.getByText("Title is required.")).toBeInTheDocument();
```

But your setup can stay direct:

```ts
await signInAs(testUser);
await seed(db, { notes: schema.notes }, { count: 3, seed: 2025 });
vi.setSystemTime(new Date("2026-05-06T00:00:00.000Z"));
localStorage.setItem("theme", "dark");
```

## What You Get

- **Real RSC path**: Server render, Flight payload, Client Component hydration, Server Action, rerendered UI.
- **Slice-level scope**: Test one component, page, form, or flow without booting the whole deployed app.
- **White-box inputs**: Seed the database, set auth/session state, mock IO, fake clocks, set cookies/headers, and control browser state.
- **Black-box output**: Assert what the user sees and does in a real browser through `vitest/browser`.
- **Fast inner loop**: Vitest watch mode reruns related tests from the module graph.
- **Real coverage**: Line, branch, and function coverage for the slice under test.
- **No deployed infra**: Use in-memory infrastructure like PGlite instead of preview servers and preview databases for every state.
- **Cheap state matrices**: Role, theme, viewport, feature flag, locale, and database state can be flipped in milliseconds.

## Browser-Compatible Server Code

This plugin leans into the overlap between modern server code, edge runtimes, Node, and the browser. RSC code often already uses Web Platform APIs:

- Web Streams API instead of `node:stream`
- `Uint8Array` instead of direct `Buffer` coupling
- Web Crypto API instead of `node:crypto`
- `Blob` and `File` for binary data
- `fetch`, `Request`, `Response`, `Headers`, `URL`, and `FormData` for HTTP/data primitives

When a dependency still expects Node globals like `Buffer`, use Vite's normal polyfill story:

```ts
import { nodePolyfills } from "vite-plugin-node-polyfills";
import { defineConfig } from "vitest/config";
import { vitestPluginRSC } from "vitest-plugin-rsc";

export default defineConfig({
  plugins: [nodePolyfills(), vitestPluginRSC()],
});
```

The goal is not to pretend the browser is production. The goal is to keep RSC component tests close enough to the runtime model while preserving the control that makes unit tests valuable.

## Requirements

This plugin currently requires [Vitest Browser Mode](https://vitest.dev/guide/browser/).

## Quick Start

### 1. Install

```bash
npm install -D vitest-plugin-rsc
pnpm add -D vitest-plugin-rsc
yarn add -D vitest-plugin-rsc
bun add -D vitest-plugin-rsc
```

For browser mode with Playwright:

```bash
pnpm add -D @vitest/browser-playwright playwright
```

### 2. Register The Plugin

```ts
// vitest.config.ts
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";
import { vitestPluginRSC } from "vitest-plugin-rsc";

export default defineConfig({
  plugins: [vitestPluginRSC()],
  test: {
    browser: {
      enabled: true,
      provider: playwright(),
      instances: [{ browser: "chromium" }],
    },
    setupFiles: ["./src/vitest.setup.ts"],
  },
});
```

For Next.js App Router tests, add `vitestPluginNext()`:

```ts
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";
import { vitestPluginRSC } from "vitest-plugin-rsc";
import { vitestPluginNext } from "vitest-plugin-rsc/nextjs/plugin";

export default defineConfig({
  plugins: [vitestPluginRSC(), vitestPluginNext()],
  test: {
    browser: {
      enabled: true,
      provider: playwright(),
      instances: [{ browser: "chromium" }],
    },
    setupFiles: ["./src/vitest.setup.ts"],
  },
});
```

### 3. Boot The Runtime

```ts
// src/vitest.setup.ts
import { beforeAll, beforeEach } from "vitest";
import { cleanup, initialize } from "vitest-plugin-rsc/testing-library";

beforeAll(() => {
  initialize();
});

beforeEach(async () => {
  await cleanup();
});
```

For Next.js:

```ts
import { beforeAll, beforeEach } from "vitest";
import { cleanup, initialize } from "vitest-plugin-rsc/nextjs/testing-library";

beforeAll(() => {
  initialize();
});

beforeEach(async () => {
  await cleanup();
});
```

## Example: Server Action Form

This is the shape the plugin is designed for: one focused app slice, full behavior path, direct setup.

```tsx
import { expect, test } from "vitest";
import { page, userEvent } from "vitest/browser";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { seed } from "drizzle-seed";

import * as schema from "#db/schema";
import { db } from "#lib/db.mock";
import { signInAs, testUser } from "#test/auth";
import NewNotePage from "./page";

test("validates a new note without losing entered content", async () => {
  await signInAs(testUser);
  localStorage.setItem("theme", "dark");

  await seed(db, { notes: schema.notes }, { count: 3, seed: 2025 }).refine((f) => ({
    notes: {
      columns: {
        ownerId: f.valuesFromArray({ values: [testUser.id] }),
        title: f.valuesFromArray({
          values: ["Inbox triage", "Release plan", "Bug bash"],
          isUnique: true,
        }),
        content: f.loremIpsum({ sentencesCount: 2 }),
      },
    },
  }));

  await renderServer(<NewNotePage />);

  await userEvent.fill(page.getByLabelText("Content"), "Keep this body");
  await userEvent.click(page.getByRole("button", { name: "Create note" }));

  await expect.element(page.getByText("Title is required.")).toBeInTheDocument();
  await expect.element(page.getByDisplayValue("Keep this body")).toBeInTheDocument();
});
```

That test can cover a Server Component, Client Components, a Server Action, database setup, browser state, and the final UI without starting a separate app server.

The repository's `playground/nextjs-notes-demo` app is the larger reference for these patterns. It shows a Next.js App Router notes app using Better Auth, Drizzle, PGlite test databases, shadcn-style UI components, form/action tests, mocked email, and per-test seeding without requiring external infrastructure.

## Example: Drizzle + PGlite Setup

PGlite is a good fit for this model because it gives you Postgres-compatible behavior inside the browser test runtime.

One pattern:

1. Generate SQL from the current Drizzle schema in global setup.
2. Create a migrated in-memory PGlite base database in `beforeAll`.
3. Clone that base database in `beforeEach`.
4. Wrap each clone with `drizzle-orm/pglite`.
5. Seed rows directly in the test.

```ts
// vitest.global-setup.ts
import type { TestProject } from "vitest/node";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import * as schema from "./db/schema";

export async function setup(project: TestProject) {
  const empty = generateDrizzleJson({});
  const current = generateDrizzleJson(schema);
  const statements = await generateMigration(empty, current);
  project.provide("testSchemaSQL", statements.join("\n"));
}
```

```ts
// src/vitest.setup.ts
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { beforeAll, beforeEach, inject, vi } from "vitest";
import { cleanup, initialize } from "vitest-plugin-rsc/nextjs/testing-library";

import * as schema from "#db/schema";
import { reset } from "#lib/db.mock";

let base: PGlite;

beforeAll(async () => {
  initialize();

  base = await PGlite.create("memory://");
  await base.exec(inject("testSchemaSQL"));
});

beforeEach(async () => {
  await cleanup();

  const clone = await base.clone();
  reset(drizzle(clone, { schema }));

  vi.setSystemTime(new Date("2026-05-06T00:00:00.000Z"));
});
```

```ts
// src/lib/db.mock.ts
import type { DB } from "./db.types";

export let db: DB;

export function reset(value: DB) {
  db = value;
}
```

Your app code can import `db` through an alias that points to the production adapter normally and to `db.mock.ts` in tests.

## Next.js Helpers

The Next.js plugin adds aliases and optimizer config for App Router internals:

```ts
import { vitestPluginNext } from "vitest-plugin-rsc/nextjs/plugin";
```

It provides test-friendly versions of:

- `next/navigation`
- `next/headers`
- `next/cache`
- `next/link`

It also exposes `NextRouter` for components that use App Router context:

```tsx
import { NextRouter } from "vitest-plugin-rsc/nextjs/testing-library";

await renderServer(
  <NextRouter url="/note/123/hello?q=test" route="/note/[id]/[slug]">
    <NoteEditor />
  </NextRouter>,
);
```

Use `url` and `route` when your component reads routing state through hooks like `usePathname`, `useParams`, or `useSearchParams`.

## How It Works

`renderServer` runs the same React Server Components protocol your app uses in production:

1. Render the server tree to a React Flight stream.
2. Read that Flight stream on the client.
3. Resolve any Client Component references.
4. Render the final React tree into the browser DOM.

The transport is the only unusual part. In production, the browser fetches the Flight stream from a server endpoint. In this plugin, the stream is passed between Vite environments inside the Vitest browser runtime.

The plugin creates those two environments:

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

So the full loop is:

1. `renderServer(<ServerComponent />)` renders the server tree to a Flight stream.
2. The Flight client calls `importReactClient(...)` when it needs browser/client modules.
3. `importReactClient` sends Vite ModuleRunner invokes over websocket.
4. Vite resolves those invokes in the `react_client` environment.
5. The browser receives the result, deserializes the Flight stream, and Testing Library renders it into the DOM.
6. Browser interactions can call Server Actions, fetch a new Flight payload, and rerender.
