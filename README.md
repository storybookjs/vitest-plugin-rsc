# vitest-plugin-rsc

> Test React Server Components and Next.js App Router apps in Vitest Browser Mode.

[![npm version](https://img.shields.io/npm/v/vitest-plugin-rsc?color=cb3837)](https://www.npmjs.com/package/vitest-plugin-rsc)
[![CI](https://github.com/storybookjs/vitest-plugin-rsc/actions/workflows/ci.yml/badge.svg)](https://github.com/storybookjs/vitest-plugin-rsc/actions/workflows/ci.yml)
[![License](https://img.shields.io/npm/l/vitest-plugin-rsc)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D24-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-11-F69220?logo=pnpm&logoColor=white)](https://pnpm.io/)

`vitest-plugin-rsc` runs your server code in the browser tab of a Vitest Browser Mode test, next to your assertions. For a Next.js app that is the whole app: Next's own request handler renders a route, the tab shows the HTML, and Next's own client code hydrates it.

That gives a kind of test that unit tests and E2E tests can't easily reach:

**DB → RSC → pixels → actions → DB → pixels. One slice at a time.**

Seed exactly the state a route needs, open it, use the hydrated page in a real browser, run its Server Actions, and assert on what the user sees and on what the server stored.

## Table Of Contents

- [Why This Exists](#why-this-exists)
- [What You Get](#what-you-get)
- [Requirements](#requirements)
- [Next.js](#nextjs)
  - [Set Up](#set-up)
  - [Open A Route](#open-a-route)
  - [Render One Slice Of A Route](#render-one-slice-of-a-route)
  - [Server Actions](#server-actions)
  - [Mocks](#mocks)
  - [Requests And Route Handlers](#requests-and-route-handlers)
  - [Caching](#caching)
  - [Server Code In A Tab](#server-code-in-a-tab)
  - [Example: Drizzle + PGlite](#example-drizzle--pglite)
  - [API](#api)
- [React Server Components Without Next.js](#react-server-components-without-nextjs)
- [Server Code That Runs In A Browser](#server-code-that-runs-in-a-browser)
- [Test Concurrency](#test-concurrency)
- [How It Works](#how-it-works)
- [What Does Not Work Yet](#what-does-not-work-yet)
- [Playgrounds](#playgrounds)

## Why This Exists

Covering every state with only E2E is usually impractical. E2E runs are slow because each test has to drive the UI into the state you want to assert against, hard to parallelize because tests share infrastructure, and flaky because they aren't isolated. Validation errors, user roles, locales, feature flags, loading/empty/error states, time-dependent UI — most of those variants just get skipped. That coverage belongs at the base of the test pyramid.

<p align="center">
  <img src="docs/assets/test-pyramid.svg" alt="Test pyramid: a small Playwright E2E layer above a wider Vitest unit, component, and integration layer" width="760" />
</p>

For React Server Components, that base has been missing. Rendering Server Components inside a unit-style test process has been [an open problem since 2023](https://github.com/testing-library/react-testing-library/issues/1209), so the whole RSC pipeline got pushed up to E2E — exactly where broad variant coverage doesn't fit.

`vitest-plugin-rsc` fills the missing base. A route, a form or a single component runs through the full pipeline — server render, Flight, HTML, hydration, Server Action, rerender — with white-box control over the inputs and assertions on the rendered page.

Your assertions stay user-facing and your setup stays direct:

```tsx
test("favorite toggle updates stored favorite state", async () => {
  // seed DB
  await signInAs(testUser);
  const [inserted] = await db
    .insert(notes)
    .values({ ownerId: testUser.id, title: "Toggle me", isFavorite: false })
    .returning({ id: notes.id });
  if (!inserted) throw new Error("Failed to insert note");

  // RSC -> pixels
  await renderServer({ url: "/notes" });

  // action -> DB -> pixels
  await page.getByRole("button", { name: "Favorite note" }).click();
  await expect
    .poll(async () => {
      const [row] = await db.select().from(notes).where(eq(notes.id, inserted.id));
      return row?.isFavorite;
    })
    .toBe(true);
  await expect.element(page.getByRole("button", { name: "Unfavorite note" })).toBeInTheDocument();
});
```

Agents do better when wrapped in a self-healing loop with fast unit tests — edit, run tests, repair, repeat — and RSC has been the hardest React surface to put in that loop.

## What You Get

- **Real Next.js behaviour**: the request goes through Next's own request handler, renderer and router. Layouts, `loading.tsx`, error boundaries, redirects, cookies, Server Actions, route handlers and the Data Cache do what they do in your app.
- **Focused scope**: Test a whole route, or one component in place of the page of a route.
- **White-box inputs**: The server runs in the test's tab. The `db` your test seeds is the module instance your Server Components read. Mock IO, fake clocks, set cookies and headers.
- **Black-box output**: Assert what the user sees and does via `vitest/browser` — Playwright locators (`getByRole`, `getByText`, etc.) and `expect.element` matchers.
- **Watch mode**: Vitest reruns the tests of the project when you edit a file of the app.
- **No deployed infra**: Use in-memory infrastructure like PGlite instead of spinning up a preview server and database.
- **Per-test isolation**: Each test starts with an empty Data Cache, without cookies, and without what the app put in `localStorage` and `sessionStorage`.

## Requirements

- Vitest 5 or later, in [Browser Mode](https://vitest.dev/guide/browser/). The examples use Playwright as the browser provider.
- For Next.js: the App Router, and `next@16.4` or later. CI runs the two Next.js playgrounds against the pinned `next@16.4.0`, against `next@latest` and against `next@canary`. With a Next.js whose build code the plugin does not know, a run stops when it starts, with the version and what changed: see [When Next Changes](docs/next-routes.md#when-next-changes).

## Next.js

### Set Up

```bash
npm install -D vitest-plugin-rsc vitest @vitest/browser-playwright playwright
```

```ts
// vitest.config.ts
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";
import { vitestPluginRSC } from "vitest-plugin-rsc";
import { vitestPluginNext } from "vitest-plugin-rsc/nextjs/plugin";

export default defineConfig({
  plugins: [vitestPluginRSC(), vitestPluginNext()],
  test: {
    include: ["**/*.test.{ts,tsx}"],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: "chromium" }],
    },
    isolate: false,
  },
});
```

`vitestPluginNext()` reads the app from the root of the Vitest project: its `next.config`, its `app` directory, and the `next` package it has installed. It needs no setup file. It registers its own, which leaves the page and clears the tab before and after every test.

`isolate: false` is the configuration this is tested with: both Next.js playgrounds of this repository run with it. Without isolation the test files of a tab share their modules, so the server of the app loads once per tab and not once per test file. It also means a mock is for every test file of the tab, which is why mocks belong in a setup file, see [Mocks](#mocks).

### Open A Route

`renderServer({ url })` opens a route the way a browser does. The request goes to Next's request handler, the HTML it sends is shown in the tab, and Next's client code hydrates it. It resolves once the page has hydrated. From there Next's router is in charge, so links, forms, redirects and `loading.tsx` behave as they do in your app.

```tsx
import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { renderServer } from "vitest-plugin-rsc/nextjs";
import { db } from "./lib/notes.ts";

test("navigates on the client with next/link", async () => {
  db.notes.set("1", { id: "1", title: "Inbox triage", body: "Sort the inbox" });
  await renderServer({ url: "/" });

  await page.getByRole("link", { name: "Notes", exact: true }).click();
  await expect.element(page.getByRole("heading", { name: "Notes" })).toBeVisible();
  expect(window.location.pathname).toBe("/notes");

  await page.getByRole("link", { name: "Inbox triage" }).click();
  await expect.element(page.getByText("Sort the inbox")).toBeVisible();
  expect(window.location.pathname).toBe("/notes/1");
  await expect.poll(() => document.title).toBe("Inbox triage | Notes");
});
```

`renderServer` resolves with `{ response, unmount }`: the server's `Response` to the request of the document, and a function that leaves the page.

```tsx
const { response } = await renderServer({ url: "/" });

expect(response.status).toBe(200);
```

Cookies you set on `document.cookie` before `renderServer()` are sent with the request. So are the `headers` you pass. A `cookie` header replaces the tab's cookies for that request.

```tsx
test("sends the cookies the test sets before it opens a page", async () => {
  document.cookie = "last-created=7";

  await renderServer({ url: "/notes" });

  await expect.element(page.getByText("Last created: 7")).toBeVisible();
});
```

A URL that is not a route gets the app's not-found page, with status `404`.

Before and after every test the page is left, the tab's cookies are cleared, and so is what the app put in `localStorage` and `sessionStorage`. The server forgets what it has cached. A test starts like a new browser context.

### Render One Slice Of A Route

Pass a node to test one component instead of a whole page. The route renders the node where it has its page: inside its layouts, with the request, the cookies and the router of that route.

```tsx
import { Counter } from "./components/counter.tsx";

test("renders a node in place of the page of a route", async () => {
  const { response } = await renderServer(
    <>
      <h1>Just a counter</h1>
      <Counter />
    </>,
    { url: "/notes" },
  );

  expect(response.status).toBe(200);
  expect(window.location.pathname).toBe("/notes");
  // The layouts of the route are there, its page is not.
  await expect.element(page.getByRole("navigation", { name: "Main" })).toBeVisible();
  await expect.element(page.getByRole("heading", { name: "Just a counter" })).toBeVisible();
  await expect.element(page.getByRole("heading", { name: "Notes" })).not.toBeInTheDocument();

  await page.getByRole("button", { name: "Count: 0" }).click();
  await expect.element(page.getByRole("button", { name: "Count: 1" })).toBeVisible();
});
```

Without a `url` the node renders at `/`. The page module of the route is not loaded, so its `generateMetadata`, `metadata`, `viewport` and segment config like `dynamic` do not apply. Those of the layouts do. Parallel slots keep their own pages. At a URL that is not a route there is no page to replace, so the node is not rendered and you get the not-found page.

A node can be a Server Component that reads the request:

```tsx
import { cookies, headers } from "next/headers";

async function RequestInfo() {
  return (
    <dl>
      <dt>Tenant</dt>
      <dd>{(await headers()).get("x-tenant")}</dd>
      <dt>Last created</dt>
      <dd>{(await cookies()).get("last-created")?.value}</dd>
    </dl>
  );
}

test("gives a node the request: its headers and cookies", async () => {
  document.cookie = "last-created=7";

  await renderServer(<RequestInfo />, { url: "/notes", headers: { "x-tenant": "acme" } });

  await expect.element(page.getByText("acme")).toBeVisible();
  await expect.element(page.getByText("7", { exact: true })).toBeVisible();
});
```

### Server Actions

A Server Action is what it is in your app: a `POST` from Next's router to Next's request handler. What the action does to cookies, to the cache and to the router happens for real.

```ts
// app/lib/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "./notes.ts";

export async function createNote(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;
  const id = String(db.notes.size + 1);
  db.notes.set(id, { id, title, body: "" });
  (await cookies()).set("last-created", id);
  revalidatePath("/notes");
  redirect(`/notes/${id}`);
}
```

```tsx
test("runs a Server Action that sets a cookie, revalidates and redirects", async () => {
  await renderServer({ url: "/notes/new" });

  await page.getByRole("textbox", { name: "Title" }).fill("Plan the week");
  await page.getByRole("button", { name: "Create" }).click();

  // redirect() in the action: the router lands on the new note.
  await expect.element(page.getByRole("heading", { name: "Plan the week" })).toBeVisible();
  expect(window.location.pathname).toBe("/notes/1");
  await expect.poll(() => document.title).toBe("Plan the week | Notes");
  expect(db.notes.get("1")?.title).toBe("Plan the week");
  expect(document.cookie).toContain("last-created=1");

  // The cookie reaches the next server render.
  await page.getByRole("link", { name: "Notes", exact: true }).click();
  await expect.element(page.getByText("Last created: 1")).toBeVisible();
});
```

A Client Component that imports an action calls the server the same way, also when it is the node of the test:

```tsx
import { FavoriteButton } from "./components/favorite-button.tsx";

test("calls a Server Action from a node", async () => {
  db.notes.set("1", { id: "1", title: "Inbox triage", body: "" });

  await renderServer(<FavoriteButton id="1" favorite={false} />, { url: "/notes/1" });

  await page.getByRole("button", { name: "Favorite" }).click();
  await expect.element(page.getByRole("button", { name: "Favorite", pressed: true })).toBeVisible();
  expect(db.notes.get("1")?.favorite).toBe(true);
});
```

### Mocks

`vi.mock()` replaces the module that your Server Components, Server Actions and route handlers import. Put the mocks of app modules in a setup file. With `isolate: false` the test files of a tab share their modules, so the file that loads a module first decides whether the others get the mock. A setup file runs before every test file.

A bare `vi.mock()` is enough. Each test says what the mock does, through `vi.mocked()`:

```ts
// vitest.setup.ts
import { vi } from "vitest";

vi.mock("./app/lib/weather.ts");
```

On Vitest 5.0 as published this is not enough: in browser mode it imports a test file without waiting for the mocks of a setup file, so a test file with only static imports gets the real module ([vitest-dev/vitest#11450](https://github.com/vitest-dev/vitest/issues/11450)). Until Vitest has fixed it, import the mocked module in the setup file after the `vi.mock()` call: `await import("./app/lib/weather.ts");`. This repository patches `@vitest/browser` instead (`patches/`), which is why its own setup files do not have that line.

```ts
// vitest.config.ts
test: {
  setupFiles: ["./vitest.setup.ts"],
}
```

```tsx
import { expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { renderServer } from "vitest-plugin-rsc/nextjs";
import { getForecast } from "../lib/weather.ts";

test("renders a route with a server module mocked in the setup file", async () => {
  vi.mocked(getForecast).mockResolvedValue("sunny");

  await renderServer({ url: "/forecast" });

  await expect.element(page.getByText("Today: sunny")).toBeVisible();
  expect(getForecast).toHaveBeenCalledOnce();
});
```

A mock does not reach a Client Component. Client Components load in module graphs of their own.

### Requests And Route Handlers

`handleRequest(url, init)` sends one request to the app and resolves with the response. It takes what `fetch` takes. Use it when the response is what you assert on: a status, a header, the HTML or the Flight payload. The request carries the tab's cookies, and the cookies the server sets go into the tab.

Route handlers (`app/**/route.ts`) are served too, and `handleRequest` is how a test calls one:

```ts
import { expect, test } from "vitest";
import { handleRequest } from "vitest-plugin-rsc/nextjs";
import { db } from "../lib/notes.ts";

test("gives a route handler the body of a request and the cookies of the tab", async () => {
  db.notes.set("1", { id: "1", title: "Inbox triage", body: "Sort the inbox" });
  document.cookie = "editor=kasper";

  const response = await handleRequest("/api/notes/1", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "Inbox zero" }),
  });

  expect(await response.json()).toEqual({
    note: { id: "1", title: "Inbox zero", body: "Sort the inbox" },
    editor: "kasper",
  });
  expect(db.notes.get("1")?.title).toBe("Inbox zero");
  // Set with cookies() in the handler.
  expect(document.cookie).toContain("last-renamed=1");
});
```

A `fetch` from a Client Component to a route handler reaches it too, with the tab's cookies. A same-origin `fetch` goes to the app when its path is one of the app's routes, or when Next's router or a Server Action sends it. Anything else goes to the Vite dev server.

A handler that throws answers `500` and logs the error with `console.error`, as `next start` does.

### Caching

Next's Data Cache works across requests: `unstable_cache`, and a `fetch` with `cache: "force-cache"` or `next: { revalidate }`. So do `revalidateTag()` and `revalidatePath()` from a Server Action or a route handler, and `updateTag()` and `refresh()` from a Server Action. Every test starts with an empty cache.

```ts
// app/lib/reports.ts
import { unstable_cache } from "next/cache";

// What a test sets and reads: who writes the reports, how long one takes, and
// how many were written.
export const reports = { author: "nobody", duration: 0, written: 0 };

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// A slow computation that Next's Data Cache keeps, under the tag "reports".
export const getReport = unstable_cache(
  async (id: string) => {
    await delay(reports.duration);
    reports.written += 1;
    return `Report ${id} by ${reports.author}, number ${reports.written}`;
  },
  ["report"],
  { tags: ["reports"] },
);
```

```tsx
test("computes again after a route handler has expired the tag", async () => {
  await renderServer({ url: "/reports/7" });
  await expect.element(page.getByText("Report 7 by nobody, number 1")).toBeVisible();

  // The route handler calls revalidateTag("reports", { expire: 0 }).
  const response = await handleRequest("/api/revalidate?tag=reports", { method: "POST" });
  expect(await response.json()).toEqual({ revalidated: true });
  await renderServer({ url: "/reports/7" });

  await expect.element(page.getByText("Report 7 by nobody, number 2")).toBeVisible();
});
```

`"use cache"` does not work yet. See [Caching](docs/next-routes.md#caching) for the details, and for what differs inside a cached function after its first `await`.

### Server Code In A Tab

The server runs in a tab, and your server code is told it is on a server, the way Next's own build tells it. In Server Components, Server Actions, route handlers and the modules and packages they import, and in Client Components while they render to HTML, `typeof window` is `"undefined"` and `fetch` is the one Next patches. Test files and setup files keep the tab's `typeof window` and `fetch`.

Only `typeof` is answered that way. Server code that reads `window.innerWidth` without asking first throws on a server, and reads the tab's `window` here.

A module that has to know it is in a browser is listed in `browserModules`. A helper of your tests that asks before it touches the page is one:

```ts
// test/browser.ts
export function scrollToTop(): void {
  if (typeof window !== "undefined") window.scrollTo(0, 0);
}
```

```ts
vitestPluginNext({ browserModules: ["test/**"] });
```

A Client Component that renders something else on the server than in the browser fails the way it does in production, with a hydration mismatch. React reports one with `console.error`. Both playgrounds fail a test on any `console.error`:

```ts
let consoleError: MockInstance<typeof console.error>;

beforeEach(() => {
  consoleError = vi.spyOn(console, "error");
});

afterEach(() => {
  expect(consoleError.mock.calls).toEqual([]);
});
```

See [Server Code In A Tab](docs/next-routes.md#server-code-in-a-tab) for what is replaced, where that has gaps, and when a package needs an entry in `browserModules`.

### Example: Drizzle + PGlite

PGlite runs Postgres in the tab, so every test can have a database of its own. This is how `playground/nextjs-notes-demo` does it.

Two files sit next to each other:

- `lib/db.ts` is the database adapter the app imports.
- `lib/__mocks__/db.ts` is what `vi.mock("#lib/db.ts")` puts in its place. It exports `db` and a `resetDb` function, so the setup file can point `db` at a new database for every test.

```ts
// lib/__mocks__/db.ts
import type { DB } from "#lib/db.types.ts";

let db: DB;

function resetDb(value: DB) {
  db = value;
}

export { db, resetDb };
```

Global setup generates the SQL of the current Drizzle schema, in Node:

```ts
// vitest.global-setup.ts
import type { TestProject } from "vitest/node";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import * as schema from "./db/schema.ts";

export async function setup(project: TestProject) {
  const empty = generateDrizzleJson({});
  const current = generateDrizzleJson(schema);
  const statements = await generateMigration(empty, current);
  project.provide("testSchemaSQL", statements.join("\n"));
}

declare module "vitest" {
  export interface ProvidedContext {
    testSchemaSQL: string;
  }
}
```

The setup file creates one migrated database, and clones it for every test:

```ts
// vitest.setup.ts
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterAll, beforeAll, beforeEach, inject, vi } from "vitest";
import * as schema from "#db/schema.ts";
import * as dbModule from "#lib/db.ts";

vi.mock("#lib/db.ts");

const { resetDb } = dbModule as typeof import("#lib/__mocks__/db.ts");

let base: PGlite;

beforeAll(async () => {
  base = await PGlite.create("memory://");
  await base.exec(inject("testSchemaSQL"));
});

beforeEach(async () => {
  const clone = await base.clone();
  if (!(clone instanceof PGlite)) {
    throw new TypeError("Expected PGlite.clone() to return a PGlite instance");
  }
  resetDb(drizzle(clone, { schema }));
});

afterAll(async () => {
  await base.close();
});
```

App code keeps importing `db` from `#lib/db.ts`. A test seeds rows with the same `db.insert(...)` calls the app uses, as in the test under [Why This Exists](#why-this-exists).

### API

```ts
import { cleanup, handleRequest, renderServer } from "vitest-plugin-rsc/nextjs";
import { vitestPluginNext } from "vitest-plugin-rsc/nextjs/plugin";
```

| Function                                   | What it does                                                                                  |
| ------------------------------------------ | --------------------------------------------------------------------------------------------- |
| `renderServer({ url, headers })`           | Opens a route. Resolves with `{ response, unmount }` once the page has hydrated.              |
| `renderServer(<Node />, { url, headers })` | Opens the route with the node in place of its page. `url` defaults to `/`.                    |
| `handleRequest(input, init)`               | Sends one request to the app, like `fetch`. Resolves with the `Response`.                     |
| `cleanup()`                                | Leaves the page, clears cookies, storage and the cache. The plugin runs it around every test. |
| `vitestPluginNext({ browserModules })`     | The Vite plugin. `browserModules` are glob patterns, relative to the project root.            |

The types are `RenderServerOptions`, `RenderServerResult` and `VitestPluginNextOptions`.

The package also exports `vitest-plugin-rsc/nextjs/rsc`, `/ssr`, `/client` and `/app-page-entrypoint`. Those are internal: the plugin imports them itself, and Vite has to be able to resolve them.

## React Server Components Without Next.js

`vitestPluginRSC()` on its own renders Server Components for any React app. There is no request and no router: `renderServer` renders a node to a Flight stream and reads it back in the same tab.

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

```tsx
import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { renderServer } from "vitest-plugin-rsc/testing-library";
import { ServerCounter } from "./server.tsx";

test("server action", async () => {
  await renderServer(<ServerCounter />);

  await page.getByRole("button", { name: "server-counter: 0" }).click();
  await page.getByRole("button", { name: "server-counter: 1" }).click();
  await expect.element(page.getByRole("button", { name: "server-counter: 2" })).toBeVisible();
});
```

This `renderServer` takes `{ container, baseElement, wrapper }` and resolves with `{ container, baseElement, rerender, unmount, asFragment }`. After a Server Action the tree is rendered again.

## Server Code That Runs In A Browser

The plugin runs server code in a browser tab. The surface is closer than it looks: edge runtimes like Vercel Edge and Cloudflare Workers also lack most of the Node API, and server code written for the edge can usually run in a tab too.

- `vitestPluginRSC()` provides `node:async_hooks`, with an `AsyncLocalStorage` that works for one request at a time.
- `vitestPluginNext()` adds what Next's edge runtime has: `Buffer`, `process.env`, and the modules `buffer`, `events`, `assert` and `util`, from the builds Next ships.

A fast test should not touch the real database, file system or network. Keep IO inside the tab:

- **Database**: an in-memory implementation like [PGlite](https://pglite.dev/) for Postgres or [sql.js](https://github.com/sql-js/sql.js) for SQLite.
- **File system**: an in-memory implementation like [`memfs` via Vitest](https://vitest.dev/guide/mocking/file-system).
- **HTTP**: a request interceptor like [MSW in Vitest browser mode](https://mswjs.io/docs/recipes/vitest-browser-mode), or a mocked module.

Where you have a choice, use the APIs that edge runtimes, Node and browsers share: Web Streams, `Uint8Array`, Web Crypto, `Blob` and `File`, and `fetch`, `Request`, `Response`, `Headers`, `URL` and `FormData`.

If a dependency imports a Node module that is not there, [`vite-plugin-node-polyfills`](https://github.com/davidmyersdev/vite-plugin-node-polyfills) covers the rest:

```ts
import { nodePolyfills } from "vite-plugin-node-polyfills";
import { defineConfig } from "vitest/config";
import { vitestPluginRSC } from "vitest-plugin-rsc";

export default defineConfig({
  plugins: [nodePolyfills(), vitestPluginRSC()],
});
```

## Test Concurrency

[`test.concurrent`](https://vitest.dev/api/#test-concurrent) does not work for tests that read `AsyncLocalStorage`. That is every test of a Next.js app: `headers()`, `cookies()`, `next/cache` and Server Actions all read it. A tab cannot carry a store across `await`, so the server handles one request at a time, and two tests at once would read each other's request. Tests in a file run one after another, and test files still run in parallel, each in a tab of its own.

## How It Works

Next.js is a build and a runtime. Only the build is tied to a bundler. The plugin does the build with Vite, and asks Next's own build code for everything that is not bundling: the routes, the loader tree of a route, its request handler, the compile-time constants and the module aliases. Behind those, Next's runtime runs unchanged.

Next compiles an app into three layers, each with its own module graph and its own build of React. Each is a Vite environment here, and all three run in the test's tab:

| Layer     | Runs                                              | Vite environment |
| --------- | ------------------------------------------------- | ---------------- |
| `rsc`     | Server Components, Server Actions, route handlers | `client`         |
| `ssr`     | The request handler of a page, the HTML renderer  | `next_ssr`       |
| `browser` | Next's router, your Client Components             | `react_client`   |

The test runs in `client`, the Vite environment of the `rsc` layer. That is why a module your test imports is the instance your Server Components read.

[docs/next-routes.md](docs/next-routes.md) is the full description: what comes from Next, how a request travels, what stands in for a server, caching, how server code is told it is on a server, and what is checked of the installed Next.js. [docs/architecture.md](docs/architecture.md) describes the part without Next.js: the two environments and the module runner between them.

## What Does Not Work Yet

- `next/font`, `next/image` optimization, and metadata files like `icon.png` and `sitemap.ts`.
- `middleware.ts` / `proxy.ts`, and the redirects, rewrites and headers of `next.config`.
- `"use cache"`. And inside a function cached with `unstable_cache`, after its first `await`, the request's store is read instead of the cache's.
- A mock for Client Components.
- `vitest related` and `vitest --changed` for route files. They pick a test file by the modules it imports. The plugin loads `page.tsx`, `layout.tsx` and `route.ts`, not the test file, so a change to one of those picks no test file. A change to a module that a test file imports does pick it.
- Route handlers run as they do on Next's edge runtime, also the ones a deployment runs on Node.js.
- More than one request at a time. A response that streams without end holds up every request after it.
- A navigation that leaves the page without Next's router, like `location.assign()`, needs the Navigation API, which today means Chromium.

The full list, with the reasons, is under [Not Yet](docs/next-routes.md#not-yet).

## Playgrounds

- `playground/nextjs-e2e-demo` — a small Next.js app with a test for every feature of the Next.js support. The samples above come from its tests.
- `playground/nextjs-notes-demo` — a fuller Next.js notes app with Better Auth, Drizzle, PGlite test databases and shadcn/ui. Its tests open whole routes with the database and the session mocked in the tab. This is the acceptance app of this repository.
- `playground/rsc-vitest-demo` — React Server Components without Next.js.

Vitest suites are wired through the root workspace, while each package or playground owns its local config:

```bash
pnpm test
pnpm test --project nextjs-e2e-demo
pnpm test --project nextjs-notes-demo-browser --project nextjs-notes-demo-node
```
