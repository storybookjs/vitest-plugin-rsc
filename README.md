# vitest-plugin-rsc

> Render React Server Components in Vitest Browser Mode.

[![npm version](https://img.shields.io/npm/v/vitest-plugin-rsc?color=cb3837)](https://www.npmjs.com/package/vitest-plugin-rsc)
[![CI](https://github.com/storybookjs/vitest-plugin-rsc/actions/workflows/ci.yml/badge.svg)](https://github.com/storybookjs/vitest-plugin-rsc/actions/workflows/ci.yml)
[![License](https://img.shields.io/npm/l/vitest-plugin-rsc)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D24-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-11-F69220?logo=pnpm&logoColor=white)](https://pnpm.io/)

`vitest-plugin-rsc` runs the RSC side of your component test in Vitest Browser Mode. The Server Component still goes through the RSC transform and Flight serialization, but it executes in the same browser test runtime as your assertions.

That unlocks a kind of test unit tests and E2E tests can't easily reach:

**DB → RSC → pixels → actions → DB → pixels. One slice at a time.**

Pick one piece of the app — a wishlist carousel, a notes form, a settings panel, or a full `page.tsx` route. Seed exactly the state that piece needs, render it, interact with the hydrated UI in a real browser, run Server Actions, and assert the rerendered result.

## Table Of Contents

- [Why This Exists](#why-this-exists)
- [What You Get](#what-you-get)
- [Requirements](#requirements)
- [Next.js Version Support](#nextjs-version-support)
- [Quick Start](#quick-start)
  - [Install](#1-install)
  - [Register The Plugin](#2-register-the-plugin)
  - [Boot The Runtime](#3-boot-the-runtime)
  - [Browser-Compatible Server Code](#4-browser-compatible-server-code)
- [Test Concurrency](#test-concurrency)
- [Example: Server Action Form](#example-server-action-form)
- [Example: Drizzle + PGlite Setup](#example-drizzle--pglite-setup)
- [Next.js App Router Helpers](#nextjs-app-router-helpers)
  - [Router Hooks And Links](#router-hooks-and-links)
  - [Request Headers And Cookies](#request-headers-and-cookies)
  - [Cache And Revalidation](#cache-and-revalidation)
- [Whole Next.js Routes](#whole-nextjs-routes)
- [Playgrounds](#playgrounds)
- [Architecture](#architecture)

## Why This Exists

Covering every state with only E2E is usually impractical. E2E runs are slow because each test has to drive the UI into the state you want to assert against, hard to parallelize because tests share infrastructure, and flaky because they aren't isolated. Validation errors, user roles, locales, feature flags, loading/empty/error states, time-dependent UI — most of those variants just get skipped. That coverage belongs at the base of the test pyramid.

<p align="center">
  <img src="docs/assets/test-pyramid.svg" alt="Test pyramid: a small Playwright E2E layer above a wider Vitest unit, component, and integration layer" width="760" />
</p>

For React Server Components, that base has been missing. Rendering Server Components inside a unit-style test process has been [an open problem since 2023](https://github.com/testing-library/react-testing-library/issues/1209), so the whole RSC pipeline got pushed up to E2E — exactly where broad variant coverage doesn't fit.

`vitest-plugin-rsc` fills the missing base. A single component, form, or `page.tsx` runs through the full RSC pipeline — server render, Flight, Client Component hydration, Server Action, rerender — with white-box control over the inputs and assertions on the rendered DOM.

Your assertions stay user-facing and your setup stays direct:

```tsx
test("archive a note", async () => {
  // seed DB
  await signInAs(testUser);
  await db.insert(notes).values({ ownerId: testUser.id, title: "Inbox triage" });

  // RSC -> pixels
  await renderServer(<NotesPage />, { url: "/notes" });
  await expect.element(page.getByText("Inbox triage")).toBeVisible();

  // action -> DB -> pixels
  await page.getByRole("button", { name: "Archive Inbox triage" }).click();
  await expect.element(page.getByText("Inbox triage")).not.toBeInTheDocument();
});
```

Agents do dramatically better when wrapped in a self-healing loop with fast unit tests — edit, run tests, repair, repeat — and RSC has been the hardest React surface to put in that loop.

## What You Get

- **Production RSC path**: Server render, Flight payload, Client Component hydration, Server Action, rerendered UI.
- **Focused scope**: Test a route's `page.tsx`, a single component, a form, or a flow without booting the whole deployed app.
- **White-box inputs**: Seed the database, set auth/session state, mock IO, fake clocks, set cookies/headers, and control browser state.
- **Black-box output**: Assert what the user sees and does via `vitest/browser` — Playwright locators (`getByRole`, `getByText`, etc.) and `expect.element` matchers.
- **Fast watch mode**: Vitest reruns just the test files affected by your edit, via the module graph.
- **Diff-scoped runs**: `vitest --changed [ref]` runs only the test files affected by your git diff, via the module graph — locally or in PR CI.
- **Code coverage**: V8 or Istanbul coverage for your RSC code, via Vitest's coverage provider.
- **No deployed infra**: Use in-memory infrastructure like PGlite instead of spinning up a preview server and database.
- **Per-test isolation**: Each test gets its own DB clone, cookies, module mocks, and DOM. Matching this in E2E means a new server or database per test — usually impractical.

## Requirements

This plugin requires [Vitest Browser Mode](https://vitest.dev/guide/browser/).

## Next.js Version Support

The base `vitestPluginRSC()` runtime is framework-agnostic. The `vitest-plugin-rsc/nextjs/*` helpers depend on Next.js App Router internals, so CI tests them against multiple Next.js targets:

- `next@latest`: current stable, following new releases automatically.
- `next@16.1`: pinned previous-stable line.
- `next@16.0`: older pinned stable line.
- `next@canary`: early warning when a private App Router internal changes.

For each target, CI builds the plugin and runs the package-level Next tests plus `playground/nextjs-no-msw-demo`.

[Whole Next.js Routes](#whole-nextjs-routes), `vitest-plugin-rsc/next`, needs `next@16.4` or later. CI runs `playground/next-e2e-demo` and `playground/nextjs-notes-demo` against the pinned `next@16.4` and against `next@canary`.

## Quick Start

### 1. Install

```bash
npm install -D vitest-plugin-rsc
```

The examples below use Playwright as the Vitest browser provider; install it (or another Vitest browser provider):

```bash
npm install -D @vitest/browser-playwright playwright
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

For Next.js, pick the setup that matches what you want to test:

| Setup       | Use when                                                                 | Action transport    |
| ----------- | ------------------------------------------------------------------------ | ------------------- |
| Without MSW | Simple action-and-rerender tests                                         | Direct (in-process) |
| With MSW    | Tests that care about `next/cache`, router refreshes, or request headers | Real `POST` via MSW |

Without MSW, Server Actions are called directly inside the RSC test runtime. The action still runs inside the Next request context, which is enough for simple action-and-rerender tests:

```ts
// src/vitest.setup.ts
import { beforeAll, beforeEach } from "vitest";
import { cleanup, initialize } from "vitest-plugin-rsc/nextjs/testing-library";

beforeAll(() => {
  initialize();
});

beforeEach(async () => {
  await cleanup();
});
```

With MSW, client-side RSC fetches and Server Action POSTs travel as real HTTP requests through MSW. This exercises the Next-style action response, route response, router refresh, and cache revalidation header path:

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

### 4. Browser-Compatible Server Code

The plugin runs server code inside the browser test runtime. That sounds wrong, but the surface is closer than it looks: edge runtimes like Vercel Edge and Cloudflare Workers also lack most of the Node API, and frameworks like Next.js already target those runtimes. Server code written for the edge can usually run in the browser too.

The plugin shims the Node built-ins server code most often reaches for, the same way Next does for its edge runtime:

- `vitestPluginRSC()` shims `node:async_hooks`.
- `vitestPluginNext()` also shims `node:buffer`, `node:events`, `node:assert`, `node:util`, and `node:os`, using Next's own pre-compiled browser-safe versions.

A fast unit test shouldn't touch the real database, filesystem, or network — those make tests slow and flaky. Standard practice is to keep IO inside the test runtime; the same picks work whether the test runs in Node or in this plugin's browser runtime:

- **Database**: an in-memory implementation like [PGlite](https://pglite.dev/) for Postgres or [sql.js](https://github.com/sql-js/sql.js) for SQLite.
- **File system**: an in-memory implementation like [`memfs` via Vitest](https://vitest.dev/guide/mocking/file-system).
- **HTTP**: a request interceptor like [MSW in Vitest browser mode](https://mswjs.io/docs/recipes/vitest-browser-mode), which catches outbound calls before they leave the test runtime.

When you have a choice, prefer the server APIs that already overlap between edge runtimes, Node, and the browser:

- Web Streams API instead of `node:stream`
- `Uint8Array` instead of direct `Buffer` coupling
- Web Crypto API instead of `node:crypto`
- `Blob` and `File` for binary data
- `fetch`, `Request`, `Response`, `Headers`, `URL`, and `FormData` for HTTP/data primitives

If a dependency still imports a Node core module or global that isn't shimmed, drop in [`vite-plugin-node-polyfills`](https://github.com/davidmyersdev/vite-plugin-node-polyfills). It covers all of Node's core modules (including `node:` protocol imports) and optionally globals like `Buffer`, `process`, and `global`. See its [README](https://github.com/davidmyersdev/vite-plugin-node-polyfills#readme) for the full `include` / `exclude` / `globals` / `overrides` options:

```ts
import { nodePolyfills } from "vite-plugin-node-polyfills";
import { defineConfig } from "vitest/config";
import { vitestPluginRSC } from "vitest-plugin-rsc";

export default defineConfig({
  plugins: [nodePolyfills(), vitestPluginRSC()],
});
```

## Test Concurrency

[`test.concurrent`](https://vitest.dev/api/#test-concurrent) doesn't work for tests that read `AsyncLocalStorage`, which includes anything that touches Next.js App Router internals (`headers()`, `cookies()`, `next/cache`, Server Actions). The plugin's `AsyncLocalStorage` shim is sequential, so concurrent tests would leak context between each other. Sequential tests within a file are fine; test files still run in parallel.

## Example: Server Action Form

A full `page.tsx` route here; the same pattern works for any component, form, or flow.

The page is a Server Component with a Server Action. On a validation error, the action writes the message to a cookie and calls `refresh()`.

```tsx
// app/notes/new/page.tsx
import { refresh } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { notes } from "#db/schema.ts";
import { requireUser } from "#lib/auth-session.ts";
import { db } from "#lib/db.ts";

export default async function NewNotePage() {
  const user = await requireUser();
  const error = (await cookies()).get("note-error")?.value;

  return (
    <form
      action={async (formData) => {
        "use server";

        const title = String(formData.get("title") ?? "").trim();
        const content = String(formData.get("content") ?? "");

        if (!title) {
          (await cookies()).set("note-error", "Title is required.");
          refresh();
          return;
        }

        await db.insert(notes).values({ ownerId: user.id, title, content });
        redirect("/notes");
      }}
    >
      <label htmlFor="title">Title</label>
      <input id="title" name="title" />
      {error && <p>{error}</p>}

      <label htmlFor="content">Content</label>
      <textarea id="content" name="content" />

      <button>Create note</button>
    </form>
  );
}
```

The test seeds both server-side state (auth, database) and browser-side state (`localStorage`), renders the page, interacts with the form, and asserts the rerendered UI:

```tsx
import { expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";

import { db } from "#lib/db.ts";
import { notes } from "#db/schema.ts";
import { signInAs, testUser } from "#test/auth.ts";
import NewNotePage from "./page.tsx";

vi.mock("#lib/db.ts");

test("validates a new note without losing entered content", async () => {
  await signInAs(testUser);
  localStorage.setItem("theme", "dark");

  await db.insert(notes).values({
    ownerId: testUser.id,
    title: "Inbox triage",
    content: "Existing note body",
  });

  await renderServer(<NewNotePage />, { url: "/notes/new" });

  await page.getByLabelText("Content").fill("Keep this body");
  await page.getByRole("button", { name: "Create note" }).click();

  await expect.element(page.getByText("Title is required.")).toBeInTheDocument();
  await expect.element(page.getByDisplayValue("Keep this body")).toBeInTheDocument();
});
```

That single test sets up:

- **Server-side state**: the signed-in user (`signInAs`) and a seeded database row (`db.insert`)
- **Browser-side state**: a client-side preference written to `localStorage`

Setting server and browser state in the same setup is something a pure unit test cannot reach and a full E2E test can only do through the real UI.

`vi.mock("#lib/db.ts")` replaces the production database adapter with the Vitest `__mocks__` version next to it (`lib/__mocks__/db.ts`). The mock exposes a `db` reference and a `resetDb` helper that the setup file points at a fresh PGlite clone per test. See [Drizzle + PGlite Setup](#example-drizzle--pglite-setup) below for the wiring.

## Example: Drizzle + PGlite Setup

PGlite runs Postgres in-process, so it works inside the browser test runtime.

Two files sit next to each other:

- `lib/db.ts` — the production database adapter your app code imports.
- `lib/__mocks__/db.ts` — the test stand-in that `vi.mock` swaps in. Exposes `db` plus a `resetDb` setter so the setup file can point it at a fresh PGlite clone per test.

```ts
// lib/db.ts
import { drizzle } from "drizzle-orm/neon-serverless";
import * as schema from "#db/schema.ts";

export const db = drizzle({
  connection: process.env.DATABASE_URL!,
  schema,
});
```

```ts
// lib/__mocks__/db.ts
import type { db as ProductionDb } from "#lib/db.ts";

export let db: typeof ProductionDb;

export function resetDb(value: typeof ProductionDb) {
  db = value;
}
```

The setup file then:

1. Generates SQL from the current Drizzle schema in global setup.
2. Creates a migrated in-memory PGlite base database in `beforeAll`.
3. Clones that base database in `beforeEach` so each test starts from a clean migrated state.
4. Wraps each clone with `drizzle-orm/pglite` and hands it to `resetDb`.

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
// vitest.setup.ts
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { beforeAll, beforeEach, inject, vi } from "vitest";
import { cleanup, initialize } from "vitest-plugin-rsc/nextjs/testing-library";

import * as schema from "#db/schema.ts";
import * as dbModule from "#lib/db.ts";

vi.mock("#lib/db.ts");

const { resetDb } = dbModule as typeof import("#lib/__mocks__/db.ts");

let base: PGlite;

beforeAll(async () => {
  initialize();

  base = await PGlite.create("memory://");
  await base.exec(inject("testSchemaSQL"));
});

beforeEach(async () => {
  await cleanup();

  const clone = await base.clone();
  resetDb(drizzle(clone, { schema }));

  vi.setSystemTime(new Date("2026-05-06T00:00:00.000Z"));
});
```

App code keeps importing `db` from `#lib/db.ts`. `vi.mock("#lib/db.ts")` automatically substitutes the `__mocks__` version next to it, and `resetDb` swaps in a fresh PGlite-backed Drizzle instance per test. Tests then seed rows with the same `db.insert(...)` calls they would use in production code.

## Next.js App Router Helpers

The Next.js plugin adds aliases, request context, cache context, router state, and optimizer config for App Router internals:

```ts
import { vitestPluginNext } from "vitest-plugin-rsc/nextjs/plugin";
```

Tests use the same public App Router imports your app uses. The plugin wires those entrypoints to Next's own App Router internals and fills in the test request, router, cache, and Server Action runtime around them:

- `next/link`: `<Link>` rendering and navigation through the test router.
- `next/navigation`: router hooks, selected-layout segment hooks, `redirect`, `notFound`, and the rest of the public App Router navigation exports.
- `next/headers`: `headers()` and `cookies()` in Server Components and Server Actions.
- `next/cache`: `refresh`, `revalidatePath`, `revalidateTag`, `updateTag`, and patched `fetch` behavior for tag-based caching. `unstable_cache` works too, but the examples below use the tagged `fetch` API.

The examples below aren't a separate testing API. They're normal Next.js code paths running inside a Vitest Browser Mode test.

### Router Hooks And Links

Many tests can omit routing options:

```tsx
await renderServer(<CreateNoteForm />);
```

Pass `url` when the component needs location-aware behavior — `usePathname`, `useSearchParams`, the selected-segment hooks, `next/link`, navigation assertions, request URL-dependent code, or cache invalidation against the current path. For dynamic routes, also pass the App Router route pattern with `route` so Next can derive params and selected segments from the URL:

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
  await expect.element(page.getByText("segments: notes/123")).toBeVisible();

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
import {
  useParams,
  usePathname,
  useRouter,
  useSearchParams,
  useSelectedLayoutSegments,
} from "next/navigation";

export function NoteToolbar() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const segments = useSelectedLayoutSegments();

  return (
    <>
      <p>pathname: {pathname}</p>
      <p>note id: {params.id}</p>
      <p>tab: {searchParams.get("tab")}</p>
      <p>segments: {segments.join("/")}</p>
      <button onClick={() => router.push("/notes")}>Go to notes</button>
      <Link href={{ pathname: "/notes/new", query: { from: params.id } }}>New note</Link>
    </>
  );
}
```

### Request Headers And Cookies

Pass request headers into `renderServer`. Inside Server Components and Server Actions, use Next's `headers()` and `cookies()` APIs as you normally would:

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

Server Components can use tagged cached `fetch` calls, and Server Actions can refresh the current tree or invalidate those tags. The outbound `fetch` is normally intercepted by MSW in tests — the setup file of [`playground/nextjs-notes-demo`](playground/nextjs-notes-demo) starts such a worker, though that demo itself runs on [Whole Next.js Routes](#whole-nextjs-routes) and not on these helpers.

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

The test still looks like a unit test. After the click, `updateTag("notes")` invalidates the cached fetch, the panel re-renders, and the assertion sees the new count:

```tsx
import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";

import { NotesPanel } from "./notes-panel";

test("creating a note invalidates the notes cache", async () => {
  await renderServer(<NotesPanel />, { url: "/notes" });

  await expect.element(page.getByText("notes: 0")).toBeVisible();
  await page.getByRole("button", { name: "Create note" }).click();
  await expect.element(page.getByText("notes: 1")).toBeVisible();
});
```

## Whole Next.js Routes

> Experimental. Needs `next@16.4` or later.

The `renderServer` of `vitest-plugin-rsc/next` opens a route of your app, the way a browser does: the request goes to Next's own request handler, the HTML it sends is shown in the tab, and Next's own client code hydrates it. From there Next's router is in charge, so links, forms, Server Actions, redirects, cookies and `loading.tsx` behave as they do in your app.

The test stays white-box. The server runs in the test's tab, so the `db` you seed and spy on is the one your Server Components read.

```ts
// vitest.config.ts
import { vitestPluginRSC } from "vitest-plugin-rsc";
import { vitestPluginNext } from "vitest-plugin-rsc/next/plugin";

export default defineConfig({
  plugins: [vitestPluginRSC(), vitestPluginNext()],
  // ...browser mode, as in Quick Start. There is no setup file to add.
});
```

```tsx
import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { renderServer } from "vitest-plugin-rsc/next";

import { db } from "./lib/db.ts";

test("creates a note", async () => {
  const { response } = await renderServer({ url: "/notes/new" });
  expect(response.status).toBe(200);

  await page.getByRole("textbox", { name: "Title" }).fill("Plan the week");
  await page.getByRole("button", { name: "Create" }).click();

  // The action called redirect(): the router is on the new note.
  await expect.element(page.getByRole("heading", { name: "Plan the week" })).toBeVisible();
  expect(window.location.pathname).toBe("/notes/1");
  await expect.poll(() => document.title).toBe("Plan the week | Notes");
  expect(db.notes.get("1")?.title).toBe("Plan the week");
});
```

Before and after every test the page is left, and the tab's cookies and what the app put in `localStorage` and `sessionStorage` are cleared, like a new browser context. That also goes for a page a `beforeAll` opened. Cookies you set on `document.cookie` before `renderServer()` are sent with the request, and so are the `headers` you pass it. The server forgets what it has cached, also before and after every test.

To test one slice of a route, pass a node. The route renders it where it has its page, inside its layouts, with the request, the cookies and the router of that route:

```tsx
test("favorites a note", async () => {
  db.notes.set("1", { id: "1", title: "Inbox triage", body: "" });

  await renderServer(<FavoriteButton id="1" favorite={false} />, { url: "/notes/1" });

  await page.getByRole("button", { name: "Favorite" }).click();
  expect(db.notes.get("1")?.favorite).toBe(true);
});
```

Without a `url` the node renders at `/`. The page module itself is not loaded, so its `generateMetadata`, `metadata`, `viewport` and segment config like `dynamic` do not apply; those of the layouts do. Parallel slots keep their own pages. A URL that is not a route gets the not-found page.

`renderServer` resolves with `{ response, unmount }`: the server's `Response` to the document request, and a function that leaves the page.

`vi.mock()` works on the modules your Server Components, Server Actions and route handlers import. It does not reach Client Components, which load in module graphs of their own.

The server runs in a tab, but your server code does not see the tab. In Server Components, Server Actions and the modules and packages they import, and in Client Components while they render to HTML, `typeof window` is `"undefined"` and `fetch` is the one Next patches. Test files and setup files keep the tab's `window` and `fetch`. A module that has to see the browser it really runs in, like a helper of your tests that sets `document.cookie`, is listed in `browserModules`:

```ts
vitestPluginNext({ browserModules: ["test/**"] });
```

A Client Component that renders something else on the server than in the browser now fails the way it does in production, with a hydration mismatch. With `next-themes`, for example, `useTheme()` has no theme on the server.

`handleRequest(url, init)` sends a single request and resolves with the response, for when the response is what you assert on: a status, a header, the HTML or the Flight payload.

Route handlers (`app/**/route.ts`) are served too. `handleRequest` is how a test calls one, and a `fetch` to one from a Client Component reaches it with the tab's cookies:

```ts
import { handleRequest } from "vitest-plugin-rsc/next";

test("renames a note", async () => {
  db.notes.set("1", { id: "1", title: "Inbox triage", body: "" });

  const response = await handleRequest("/api/notes/1", {
    method: "PUT",
    body: JSON.stringify({ title: "Inbox zero" }),
  });

  expect(response.status).toBe(200);
  expect(db.notes.get("1")?.title).toBe("Inbox zero");
});
```

A same-origin `fetch` goes to the app when its path is one of the app's routes, or when Next's router or a Server Action sends it. Anything else goes to the Vite dev server. A handler that throws answers `500` and logs the error with `console.error`, as `next start` does.

Next's Data Cache works across requests: `unstable_cache`, and a `fetch` with `cache: "force-cache"` or `next: { revalidate }`. So do `revalidateTag()` and `revalidatePath()` from a Server Action or a route handler, and `updateTag()` and `refresh()` from a Server Action. Every test starts with an empty cache. `"use cache"` does not work yet.

```tsx
test("shows the new price after the webhook", async () => {
  await renderServer({ url: "/products/1" });
  await expect.element(page.getByText("€ 10")).toBeVisible();

  prices.set("1", 12);
  // The route handler calls revalidateTag("prices", { expire: 0 }).
  await handleRequest("/api/webhooks/prices", { method: "POST" });
  await renderServer({ url: "/products/1" });

  await expect.element(page.getByText("€ 12")).toBeVisible();
});
```

See [docs/next-routes.md](docs/next-routes.md) for how it works and what it does not cover yet, `playground/next-e2e-demo` for a small running example, and `playground/nextjs-notes-demo` for a full app: auth, a database, forms and Server Actions.

## Playgrounds

This repository ships four reference apps under `playground/`:

- `playground/rsc-vitest-demo` — a minimal non-Next RSC app. Use this as the smallest end-to-end example of `vitest-plugin-rsc` on its own.
- `playground/nextjs-no-msw-demo` — a Next.js App Router setup that calls Server Actions directly inside the test runtime. Use this when you want the simplest Next setup.
- `playground/next-e2e-demo` — a small Next.js App Router app tested route by route. See [Whole Next.js Routes](#whole-nextjs-routes).
- `playground/nextjs-notes-demo` — a fuller Next.js App Router notes app with Better Auth, Drizzle, PGlite test databases, shadcn/ui, mocked email, and per-test seeding. Its tests open whole routes too, with the database and the session mocked in the tab. This is the acceptance app of this repository.

Vitest suites are wired through the root workspace, while each package or playground owns its local config:

```bash
pnpm test
pnpm test:run --project nextjs-notes-demo-browser --project nextjs-notes-demo-node
```

## Architecture

`renderServer` runs the same React Server Components protocol your app uses in production:

1. Render the server tree to a React Flight stream.
2. Read that Flight stream on the client.
3. Resolve any Client Component references.
4. Render the final React tree into the browser DOM.

The transport is the only unusual part. In production, the browser fetches the Flight stream from a server endpoint. In this plugin, the stream is passed between two Vite environments (`client` for RSC, `react_client` for the browser) inside the Vitest browser runtime, bridged over a dedicated Vite websocket so React can resolve Client Component references with browser conditions.

For the full walkthrough — the two-environment setup, client reference registration, the Module Runner bridge, and the end-to-end flow — see [docs/architecture.md](docs/architecture.md).
