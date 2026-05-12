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

For Next.js, choose one of these setup shapes.

Without MSW, Server Actions are called directly inside the RSC test runtime. This is enough for simple action-and-rerender tests, and the action still runs inside the Next request context:

```ts
// src/vitest.setup.ts
import { beforeEach } from "vitest";
import { cleanup, initialize } from "vitest-plugin-rsc/nextjs/testing-library";

initialize();

beforeEach(async () => {
  await cleanup();
});
```

With MSW, client-side RSC fetches and Server Action POSTs go through a request-shaped transport. This exercises the Next-style action response, route response, router refresh, and cache revalidation header path. Use this setup for closest-to-Next behavior, especially for `next/cache`, navigation refreshes, or tests that care about the actual RSC/action request boundary:

```ts
// src/vitest.setup.ts
import { afterAll, beforeAll, beforeEach } from "vitest";
import { setupWorker } from "msw/browser";
import { cleanup, initialize } from "vitest-plugin-rsc/nextjs/testing-library";
import { nextRscRequestHandlers } from "vitest-plugin-rsc/nextjs/msw";

import { appHandlers } from "./test/msw-handlers";

const worker = setupWorker(...appHandlers, ...nextRscRequestHandlers);

beforeAll(async () => {
  await worker.start({ onUnhandledRequest: "bypass" });
  initialize({ nextRscRequestsViaMsw: true });
});

beforeEach(async () => {
  worker.resetHandlers();
  await cleanup();
});

afterAll(() => {
  worker.stop();
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

  await renderServer(<NewNotePage />, { url: "/notes/new" });

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

## Next.js App Router Helpers

The Next.js plugin adds aliases, request context, cache context, router state, and optimizer config for App Router internals:

```ts
import { vitestPluginNext } from "vitest-plugin-rsc/nextjs/plugin";
```

The intent is that component tests use the same public App Router imports your app uses. The plugin wires those entrypoints to Next's own App Router internals where possible, and fills in the test request, router, cache, and Server Action runtime around them:

- `next/link`
- `next/navigation`: router hooks, selected-layout segment hooks, `redirect`, `notFound`, and the rest of the public App Router navigation exports resolved through Next's own aliases
- `next/headers`: `headers()` and `cookies()` in Server Components and Server Actions
- `next/cache`: `refresh`, `revalidatePath`, `revalidateTag`, `updateTag`, and patched tagged `fetch` cache behavior. `unstable_cache` is covered for existing apps, but the examples below prefer the stable tagged `fetch` API.

So the examples below are not a separate testing API. They are normal Next.js code paths running inside a focused Vitest Browser Mode component test.

### Router Hooks And Links

Many tests can omit routing options:

```tsx
await renderServer(<CreateNoteForm />);
```

Pass `url` when the component needs location-aware behavior, such as `usePathname`, `useSearchParams`, `next/link`, navigation assertions, request URL-dependent code, or cache invalidation against the current path. For dynamic routes, also pass the App Router route pattern with `route` so Next can derive params and selected segments from the URL:

```tsx
import { expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import {
  expectToHaveBeenNavigatedTo,
  renderServer,
} from "vitest-plugin-rsc/nextjs/testing-library";

import { NoteToolbar } from "./note-toolbar";

test("reads router state and records navigation", async () => {
  await renderServer(<NoteToolbar />, {
    url: "/notes/123?tab=activity",
    route: "/notes/[id]",
  });

  await expect.element(page.getByText("pathname: /notes/123")).toBeVisible();
  await expect.element(page.getByText("note id: 123")).toBeVisible();
  await expect.element(page.getByText("tab: activity")).toBeVisible();

  await page.getByRole("button", { name: "Go to notes" }).click();
  await vi.waitFor(() => expectToHaveBeenNavigatedTo({ pathname: "/notes" }));
});
```

If `url` is omitted, it defaults to `/`. If `route` is omitted, it defaults to the URL pathname. That is enough for static routes like `/notes`; dynamic routes like `/notes/[id]` need both `url` and `route`.

```tsx
await renderServer(<NotesPage />, { url: "/notes" });
await renderServer(<NotePage />, { url: "/notes/123", route: "/notes/[id]" });
await renderServer(<DocsPage />, { url: "/docs/a/b", route: "/docs/[...slug]" });
await renderServer(<DocsIndexPage />, { url: "/docs", route: "/docs/[[...slug]]" });
await renderServer(<DashboardNotePage />, {
  url: "/notes/123",
  route: "/(dashboard)/notes/[id]",
});
```

For example, a client component can use normal Next APIs:

```tsx
"use client";

import Link from "next/link";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";

export function NoteToolbar() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();

  return (
    <>
      <p>pathname: {pathname}</p>
      <p>note id: {params.id}</p>
      <p>tab: {searchParams.get("tab")}</p>
      <button onClick={() => router.push("/notes")}>Go to notes</button>
      <Link href={{ pathname: "/notes/new", query: { from: params.id } }}>New note</Link>
    </>
  );
}
```

### Request Headers And Cookies

Pass request headers into `renderServer`. Inside Server Components and Server Actions, use Next's real `headers()` and `cookies()` APIs:

```tsx
import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";

import { FlashProbe } from "./flash-probe";

test("reads request headers and mutates cookies from an action", async () => {
  const requestHeaders = new Headers();
  requestHeaders.set("x-test-request", "from-test");
  requestHeaders.set("cookie", "flash=initial");

  await renderServer(<FlashProbe />, {
    url: "/flash",
    headers: requestHeaders,
  });

  await expect.element(page.getByText("request id: from-test")).toBeVisible();
  await expect.element(page.getByText("flash: initial")).toBeVisible();

  await page.getByRole("button", { name: "Save flash" }).click();
  await expect.element(page.getByText("flash: saved")).toBeVisible();
});
```

```tsx
import { refresh } from "next/cache";
import { cookies, headers } from "next/headers";

export async function FlashProbe() {
  const requestId = (await headers()).get("x-test-request");
  const flash = (await cookies()).get("flash")?.value ?? "empty";

  return (
    <form
      action={async () => {
        "use server";

        (await cookies()).set("flash", "saved", { path: "/" });
        refresh();
      }}
    >
      <p>request id: {requestId}</p>
      <p>flash: {flash}</p>
      <button>Save flash</button>
    </form>
  );
}
```

### Cache And Revalidation

Server Components can use tagged cached `fetch` calls, and Server Actions can refresh the current tree or invalidate those tags:

```tsx
import { refresh, revalidatePath, revalidateTag, updateTag } from "next/cache";

import { createNote } from "#lib/notes";

async function readNotes() {
  const response = await fetch("https://example.test/api/notes", {
    cache: "force-cache",
    next: { tags: ["notes"] },
  });
  return response.json() as Promise<Array<{ id: string; title: string }>>;
}

export async function NotesPanel() {
  const notes = await readNotes();

  return (
    <section>
      <p>notes: {notes.length}</p>
      <form
        action={async () => {
          "use server";

          await createNote({ title: "New note" });
          updateTag("notes");
        }}
      >
        <button>Create note</button>
      </form>
      <form
        action={async () => {
          "use server";

          revalidateTag("notes", "max");
          refresh();
        }}
      >
        <button>Refresh stale notes</button>
      </form>
      <form
        action={async () => {
          "use server";

          revalidateTag("notes", { expire: 0 });
        }}
      >
        <button>Expire notes cache</button>
      </form>
      <form
        action={async () => {
          "use server";

          revalidatePath("/notes", "page");
        }}
      >
        <button>Revalidate notes page</button>
      </form>
    </section>
  );
}
```

The test still reads like a browser test:

```tsx
await renderServer(<NotesPanel />, { url: "/notes" });

await expect.element(page.getByText("notes: 0")).toBeVisible();
await page.getByRole("button", { name: "Create note" }).click();
await expect.element(page.getByText("notes: 1")).toBeVisible();
```

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
