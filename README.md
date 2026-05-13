# vitest-plugin-rsc

> Render React Server Components in Vitest Browser Mode.

[![npm version](https://img.shields.io/npm/v/vitest-plugin-rsc?color=cb3837)](https://www.npmjs.com/package/vitest-plugin-rsc)
[![CI](https://github.com/storybookjs/vitest-plugin-rsc/actions/workflows/ci.yml/badge.svg)](https://github.com/storybookjs/vitest-plugin-rsc/actions/workflows/ci.yml)
[![License](https://img.shields.io/npm/l/vitest-plugin-rsc)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D24-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-11-F69220?logo=pnpm&logoColor=white)](https://pnpm.io/)

Render a Server Component, run a Server Action, and assert the rerendered UI — all from a single Vitest test. Under the hood, the Server Component still goes through the real RSC transform and Flight serialization; it just executes in the same browser test runtime as your assertions.

That unlocks a kind of test unit tests and E2E tests can't easily reach:

**DB -> RSC -> pixels -> actions -> DB -> pixels. One slice at a time.**

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
- [Playgrounds](#playgrounds)
- [Architecture](#architecture)

## Why This Exists

Most RSC tests fall into an awkward gap that the React Testing Library community has [tracked since 2023](https://github.com/testing-library/react-testing-library/issues/1209):

- A unit test gives you control over data, mocks, time, and module state, but it usually does not cross the RSC boundary.
- An end-to-end test crosses the real app boundary, but the server is a black box. Seeding state, mocking IO, faking clocks, and covering edge cases all need external setup.

`vitest-plugin-rsc` gives you a middle shape: **full-stack behavior for one piece of the app — a component, a flow, or a full `page.tsx` — with white-box test control**.

It's also the shape that unlocks AI coding agents. Agents do dramatically better when wrapped in a self-healing loop with fast unit tests — edit, run tests, repair, repeat — and RSC has been the hardest React surface to put in that loop. This plugin closes the gap.

Your assertions stay user-facing and your setup stays direct — all in one test:

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

## What You Get

- **Self-healing agent loop**: AI coding agents edit, run tests, repair, repeat. Colocated Vitest tests + module-graph reruns keep each cycle a few seconds.
- **Real RSC path**: Server render, Flight payload, Client Component hydration, Server Action, rerendered UI.
- **Focused scope**: Test a route's `page.tsx`, a single component, a form, or a flow without booting the whole deployed app.
- **White-box inputs**: Seed the database, set auth/session state, mock IO, fake clocks, set cookies/headers, and control browser state.
- **Black-box output**: Assert what the user sees and does in a real browser via `vitest/browser` — full-fidelity Playwright locators (`getByRole`, `getByText`, etc.) and `expect.element` matchers.
- **Fast inner loop**: Vitest watch mode reruns just the test files affected by your edit, via the module graph.
- **Diff-scoped runs**: `vitest --changed [ref]` runs only the test files affected by your git diff, via the module graph — locally or in PR CI.
- **Code coverage**: First-class V8 or Istanbul coverage for your RSC code, via Vitest's coverage provider.
- **No deployed infra**: Use in-memory infrastructure like PGlite instead of spinning up a preview server and database.
- **Real isolation**: Each test gets a fresh DB clone, fresh cookies, fresh module mocks, and a fresh DOM. Matching this in E2E means a new server or database per test — usually impractical.
- **Run every variant**: Validation errors, user roles, locales, feature-flag combinations, loading/empty/error states, and time-dependent UI — all controllable from one test, in milliseconds.

## Requirements

This plugin requires [Vitest Browser Mode](https://vitest.dev/guide/browser/).

## Next.js Version Support

The base `vitestPluginRSC()` runtime is framework-agnostic. The `vitest-plugin-rsc/nextjs/*` helpers depend on Next.js App Router internals, so support is tracked in CI against moving Next.js install targets.

| Next.js target | Status        | Verification                                  |
| -------------- | ------------- | --------------------------------------------- |
| `latest`       | Supported     | Compatibility matrix installs and tests in CI |
| `16.1`         | Supported     | Compatibility matrix installs and tests in CI |
| `16.0`         | Supported     | Compatibility matrix installs and tests in CI |
| `canary`       | Early warning | Compatibility matrix installs and tests in CI |

The compatibility workflow installs `next@canary`, `next@latest`, `next@16.1`, and `next@16.0`, then builds the plugin and runs the package-level Next tests plus the Next.js playgrounds. `latest` follows the current stable release automatically; `canary` gives us early signal when a private App Router internal changes.

## Quick Start

### 1. Install

Pick the command for your package manager:

```bash
# pnpm
pnpm add -D vitest-plugin-rsc
```

```bash
# npm
npm install -D vitest-plugin-rsc
```

```bash
# yarn
yarn add -D vitest-plugin-rsc
```

```bash
# bun
bun add -D vitest-plugin-rsc
```

The examples below use Playwright as the Vitest browser provider. Install it (or any other provider) to run them:

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

For Next.js, pick the setup that matches what you want to test:

| Setup       | Use when                                                                 | Action transport    |
| ----------- | ------------------------------------------------------------------------ | ------------------- |
| Without MSW | Simple action-and-rerender tests                                         | Direct (in-process) |
| With MSW    | Tests that care about `next/cache`, router refreshes, or request headers | Real `POST` via MSW |

Without MSW, Server Actions are called directly inside the RSC test runtime. The action still runs inside the Next request context, which is enough for simple action-and-rerender tests:

```ts
// src/vitest.setup.ts
import { beforeEach } from "vitest";
import { cleanup, initialize } from "vitest-plugin-rsc/nextjs/testing-library";

initialize();

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

This plugin runs RSC code in the browser as if the browser were a server. That works better than it might sound: edge runtimes like Vercel Edge and Cloudflare Workers also lack the full Node.js API, and frameworks like Next.js are already designed to run on those edges. Server code that targets the edge tends to be browser-friendly too.

Out of the box the plugin shims the Node built-ins that server code most commonly reaches for, the same way Next does for its edge runtime:

- `vitestPluginRSC()` shims `node:async_hooks`.
- `vitestPluginNext()` also shims `node:buffer`, `node:events`, `node:assert`, `node:util`, and `node:os`, using Next's own pre-compiled browser-safe versions.

A fast unit test doesn't touch real databases, real filesystems, or the real network — those make tests slow, flaky, and order-dependent. Standard practice for any server-side unit test is to keep all IO inside the test runtime. These are common choices for that pattern; the same picks work whether your test runs in Node or in this plugin's browser runtime:

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

[`test.concurrent`](https://vitest.dev/api/#test-concurrent) is not supported for tests that read `AsyncLocalStorage` — including any test that touches Next.js App Router internals (`headers()`, `cookies()`, `next/cache`, Server Actions, etc.). The plugin's `AsyncLocalStorage` shim is sequential by design, so concurrent tests would leak context across each other. Sequential tests within a file are fine; test files run in parallel as usual.

## Example: Server Action Form

This is the kind of test the plugin is designed for — here a full `page.tsx` route, but the same pattern works for any component, form, or flow.

The page being tested is a Server Component with a Server Action. On validation errors, the action writes the error to a cookie and calls `refresh()`. The form stays mounted across the rerender so the typed content survives, and the next render reads the cookie to display the message:

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

then renders a Server Component, runs a Server Action, and asserts against the rerendered UI — all in one place, with no app server to boot. Mixing server and browser state in the same setup is something a pure unit test cannot reach and a full E2E test can only do through the real UI.

`vi.mock("#lib/db.ts")` replaces the production database adapter with the Vitest `__mocks__` version next to it (`lib/__mocks__/db.ts`). The mock exposes a `db` reference and a `resetDb` helper that the setup file points at a fresh PGlite clone per test. See the [Drizzle + PGlite Setup](#example-drizzle--pglite-setup) section below for the wiring.

## Example: Drizzle + PGlite Setup

PGlite is a good fit for this model because it gives you Postgres-compatible behavior inside the browser test runtime.

The pattern uses two files next to each other:

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

Component tests use the same public App Router imports your app uses. The plugin wires those entrypoints to Next's own App Router internals where possible, and fills in the test request, router, cache, and Server Action runtime around them:

- `next/link`: real `<Link>` rendering and navigation through the test router
- `next/navigation`: router hooks, selected-layout segment hooks, `redirect`, `notFound`, and the rest of the public App Router navigation exports resolved through Next's own aliases
- `next/headers`: `headers()` and `cookies()` in Server Components and Server Actions
- `next/cache`: `refresh`, `revalidatePath`, `revalidateTag`, `updateTag`, and patched `fetch` behavior for tag-based caching. `unstable_cache` is covered for existing apps, but the examples below prefer the stable tagged `fetch` API.

So the examples below are not a separate testing API. They are normal Next.js code paths running inside a focused Vitest Browser Mode component test.

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

Server Components can use tagged cached `fetch` calls, and Server Actions can refresh the current tree or invalidate those tags. The cross-network `fetch` is normally intercepted by MSW in tests — see [`playground/nextjs-notes-demo`](playground/nextjs-notes-demo) for a worked setup.

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

The test still reads like a unit test. After clicking the action button, `updateTag("notes")` invalidates the cached fetch, the panel re-renders with the new count, and the assertion just sees the updated UI:

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

## Playgrounds

This repository ships three reference apps under `playground/`:

- `playground/rsc-vitest-demo` — a minimal non-Next RSC app. Use this as the smallest end-to-end example of `vitest-plugin-rsc` on its own.
- `playground/nextjs-no-msw-demo` — a Next.js App Router setup that calls Server Actions directly inside the test runtime. Use this when you want the simplest Next setup.
- `playground/nextjs-notes-demo` — a fuller Next.js App Router notes app with Better Auth, Drizzle, PGlite test databases, shadcn/ui, MSW-routed Server Actions, mocked email, and per-test seeding. This is the larger reference for the patterns in this README.

## Architecture

`renderServer` runs the same React Server Components protocol your app uses in production:

1. Render the server tree to a React Flight stream.
2. Read that Flight stream on the client.
3. Resolve any Client Component references.
4. Render the final React tree into the browser DOM.

The transport is the only unusual part. In production, the browser fetches the Flight stream from a server endpoint. In this plugin, the stream is passed between two Vite environments (`client` for RSC, `react_client` for the browser) inside the Vitest browser runtime, bridged over a dedicated Vite websocket so React can resolve Client Component references with browser conditions.

For the full walkthrough — the two-environment setup, client reference registration, the Module Runner bridge, and the end-to-end flow — see [docs/architecture.md](docs/architecture.md).
