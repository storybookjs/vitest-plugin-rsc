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
  - [Render One Component](#render-one-component)
  - [Server Actions](#server-actions)
  - [Mocks](#mocks)
  - [Requests And Route Handlers](#requests-and-route-handlers)
  - [Caching](#caching)
  - [Fonts, Images And Styles](#fonts-images-and-styles)
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
- **Next's own compiler**: your source files go through Next's SWC transform and its font and image loaders, so `next/font`, `next/image`, `next/dynamic` and styled-jsx work, and a mistake that `next build` stops at fails the test with Next's error.
- **Focused scope**: Test a whole route, or one component on its own.
- **White-box inputs**: The server runs in the test's tab. The `db` your test seeds is the module instance your Server Components read. Mock IO, fake clocks, set cookies and headers.
- **Black-box output**: Assert what the user sees and does via `vitest/browser` — Playwright locators (`getByRole`, `getByText`, etc.) and `expect.element` matchers.
- **Precise watch mode and diff-scoped runs, as an option**: With `vitestPluginNext({ affectedTests: true })`, an edit of a page, a layout or a component reruns only the test files that opened a route with it, and `vitest --changed` and `vitest related` run those same test files. It is off by default: without it an edit reruns every test file that opens a route, and `--changed` does not find the test files of a route. See [Watch Mode](docs/next-routes.md#watch-mode).
- **No deployed infra**: Use in-memory infrastructure like PGlite instead of spinning up a preview server and database.
- **Per-test isolation**: Each test starts with an empty Data Cache, without cookies, and without what the app put in `localStorage` and `sessionStorage`.

## Requirements

- Vitest 5.0.3 or later, in [Browser Mode](https://vitest.dev/guide/browser/). The examples use Playwright as the browser provider.
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

`renderServer({ url })` opens a route the way a browser does. The request goes to Next's request handler, the HTML it sends is shown in the tab, and Next's client code hydrates it. It resolves once the page has hydrated. The first load waits for the whole page, data included, so it does not show `loading.tsx`. From there Next's router is in charge, so links, forms, redirects and `loading.tsx` behave as they do in your app.

```tsx
import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
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

A page has a `<body>` of its own, as in a browser, and so has a node: what your test has in the body moves into it, and back. A move takes the focus from an element and loads an `<iframe>` again. What is added to the document while a page or a node is open is removed when it is left. So read `document.body` when you need it: a body you kept from before the page is not the page's. Testing Library's `screen` is bound to the body at import, use `within(document.body)` or Vitest's `page`.

### Render One Component

Pass a node to test one component instead of a whole page. It renders like Testing Library renders a component: in a `<div>` container in `document.body`, without the layouts of your app. Everything around it is still Next: the request, the cookies, Server Actions, the cache and the router.

```tsx
import { Counter } from "./components/counter.tsx";

test("renders a node in a container, without the layouts of the app", async () => {
  const { container, response } = await renderServer(
    <>
      <h1>Just a counter</h1>
      <Counter />
    </>,
  );

  expect(response.status).toBe(200);
  expect(container.parentElement).toBe(document.body);
  await expect.element(page.getByRole("heading", { name: "Just a counter" })).toBeVisible();
  // No layout of the app.
  await expect.element(page.getByRole("navigation", { name: "Main" })).not.toBeInTheDocument();

  await page.getByRole("button", { name: "Count: 0" }).click();
  await expect.element(page.getByRole("button", { name: "Count: 1" })).toBeVisible();
});
```

The node is the page of a route that exists for as long as the node is there, and that has nothing of your app: no layout, no `loading`, no `error`. Next serves it the way it serves your pages.

Without a `url` the request is `GET /`, whether or not your app has a page there. With a `url`, `usePathname()` and `useSearchParams()` come from it, and the params are the ones your app's route for that URL has. You do not name the route: the plugin knows the routes of your app.

```tsx
import { RouterState } from "./components/router-state.tsx";

test("gives a node the params that the app's route has for its url", async () => {
  // The app has `app/notes/[id]/page.tsx`.
  await renderServer(<RouterState />, { url: "/notes/7?q=1" });

  await expect.element(page.getByText('{"id":"7"}')).toBeVisible();
  expect(window.location.pathname).toBe("/notes/7");
});
```

A URL that is no route of your app is not an error. The node renders there with no params.

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

  await renderServer(<RequestInfo />, { headers: { "x-tenant": "acme" } });

  await expect.element(page.getByText("acme")).toBeVisible();
  await expect.element(page.getByText("7", { exact: true })).toBeVisible();
});
```

`wrapper` wraps the node on the server, for the providers a layout would give it. It can be a Server Component:

```tsx
async function Tenant({ children }: { children: ReactNode }) {
  const tenant = (await headers()).get("x-tenant");
  return <section aria-label={`Tenant ${tenant}`}>{children}</section>;
}

test("wraps a node in a wrapper, which can be a Server Component", async () => {
  await renderServer(<Counter />, { wrapper: Tenant, headers: { "x-tenant": "acme" } });

  const tenant = page.getByRole("region", { name: "Tenant acme" });
  await tenant.getByRole("button", { name: "Count: 0" }).click();
  await expect.element(tenant.getByRole("button", { name: "Count: 1" })).toBeVisible();
});
```

What to know:

- **Global CSS is not there.** Your root layout imports it, and the node does not render in your layouts. Import it in the setup file of the test project or in the `wrapper`, as with Testing Library.
- **Leaving the node's URL loads a page.** A `<Link>`, a `router.push()` or a `redirect()` to another pathname is a page load of that route of your app, with its layouts. The node is gone after it. A change of search params stays with the node.
- **The node owns its URL.** While it is there, a request for its pathname gets the node, also from `handleRequest`, and a link to it goes nowhere. Without a `url` that pathname is `/`, so a `<Link href="/">` in a node does not open your home page. Give the node another `url` to test such a link. The same goes for a route handler: with `url: "/api/notes"`, a `fetch("/api/notes")` from the tab gets the node's HTML and not the handler's response. `unmount()` and the end of the test give the pathname back to your app.
- **The container is the node's.** It has to be empty, and it cannot be `document.body`. It also holds what Next renders around a page: a hidden `<div>` and a few comments, where metadata streams in, and Next's scripts. `asFragment()` leaves out the scripts that run, and keeps a script of data like JSON-LD.
- **`useSelectedLayoutSegments()` is empty**, as it is in a page: a node has no segments below it.
- **A node that throws, or calls `notFound()`, gets Next's own page for it**: the global error page with status `500`, where the error is also reported as uncaught, or the not-found page with status `404`. Next renders those as a document, so they are not in the container. Your `app/global-error.tsx` and `app/not-found.tsx` are not used: they belong to your app's layouts.
- **A node that calls `redirect()` while it renders** loads the page it redirects to, like a page does. The container stays empty.

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

  await renderServer(<FavoriteButton id="1" favorite={false} />);

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

On Vitest 5.0 as published this is not enough: in browser mode it imports a test file without waiting for the mocks of a setup file, so a test file with only static imports gets the real module ([vitest-dev/vitest#11450](https://github.com/vitest-dev/vitest/issues/11450), fixed by [#11520](https://github.com/vitest-dev/vitest/pull/11520) but not released yet). Until a release has the fix, import the mocked module in the setup file after the `vi.mock()` call: `await import("./app/lib/weather.ts");`. This repository patches `@vitest/browser` instead (`patches/`), which is why its own setup files do not have that line.

```ts
// vitest.config.ts
test: {
  setupFiles: ["./vitest.setup.ts"],
}
```

```tsx
import { expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
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
import { handleRequest } from "vitest-plugin-rsc/nextjs/testing-library";
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

### Fonts, Images And Styles

The source files of your app are compiled by Next's own compiler, in each of Next's three layers.

```tsx
// app/fonts/fonts.ts
import { Inter } from "next/font/google";
import localFont from "next/font/local";

export const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
export const geist = localFont({ src: "./geist-latin.woff2", variable: "--font-geist" });
```

```tsx
import { geist } from "./fonts.ts";

test("sets text in a font of next/font/local, a file of the app", async () => {
  await renderServer({ url: "/fonts" });

  const text = page.getByText("Set in Geist", { exact: true });
  await expect.element(text).toHaveClass(geist.className);
  await expect.element(text).toHaveStyle({ fontFamily: geist.style.fontFamily });
  // Served where Next's build puts it.
  const [face] = await document.fonts.load(`16px ${geist.style.fontFamily}`);
  expect(face?.status).toBe("loaded");
});
```

- **`next/font/local` and `next/font/google`**, also in a package that calls them, like `geist`. The class names, the CSS variable and the fallback font are the ones Next makes, and the font files are served. `next/font/google` downloads the font when a run first loads it, as `next dev` does. [The Compiler](docs/next-routes.md#the-compiler) says how to keep a run off the network.
- **`next/image`.** `import logo from "./logo.png"` is the object Next makes of an image, with its size and its blurred placeholder. `/_next/image` is answered by Next's image optimizer, for an imported image, a file in `public/` and an image of a server that `images.remotePatterns` allows.
- **`next/dynamic`**, also with `ssr: false`, **`next/script`**, **styled-jsx**, global CSS and CSS modules.
- **The checks of `next build`.** A client hook in a Server Component, or `server-only` code in a Client Component, fails the test with the error `next build` gives.
- **`paths` of your `tsconfig.json`**, like `@/components/button`.

Call `next/font` in a module of the app, not in a test file: Next's compiler does not run on test files. What Next's build does and the plugin does not, like the React Compiler and a `webpack` function in `next.config`, is under [What Does Not Work Yet](#what-does-not-work-yet).

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
import { cleanup, handleRequest, renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { vitestPluginNext } from "vitest-plugin-rsc/nextjs/plugin";
```

| Function                               | What it does                                                                                  |
| -------------------------------------- | --------------------------------------------------------------------------------------------- |
| `renderServer({ url, headers })`       | Opens a route. Resolves with `{ response, unmount }` once the page has hydrated.              |
| `renderServer(<Node />, options)`      | Renders a node in a container, on a route of its own. See the options below.                  |
| `handleRequest(input, init)`           | Sends one request to the app, like `fetch`. Resolves with the `Response`.                     |
| `cleanup()`                            | Leaves the page, clears cookies, storage and the cache. The plugin runs it around every test. |
| `vitestPluginNext({ browserModules })` | The Vite plugin. `browserModules` are glob patterns, relative to the project root.            |
| `vitestPluginNext({ affectedTests })`  | `true` lets watch mode and `vitest --changed` find the test files of a route. Off by default. |

The options for a node, all optional:

| Option        | What it does                                                                                        |
| ------------- | --------------------------------------------------------------------------------------------------- |
| `url`         | The URL of the request. Defaults to `/`. The params are those of your app's route for it.           |
| `headers`     | Headers for the request, next to the ones a browser sends.                                          |
| `wrapper`     | A component that wraps the node on the server. It can be a Server Component.                        |
| `container`   | An empty element for the node. Defaults to a new `<div>` in `baseElement`, which `cleanup` removes. |
| `baseElement` | Defaults to `container` if you pass one, or else to `document.body`, whichever body that is.        |

A node resolves with `{ container, baseElement, asFragment, unmount, response }`.

The types are `RenderServerOptions`, `RenderServerResult`, `RenderComponentOptions`, `RenderComponentResult` and `VitestPluginNextOptions`.

The package also exports `vitest-plugin-rsc/nextjs/rsc`, `/ssr` and `/client`. Those are internal: the plugin imports them itself, and Vite has to be able to resolve them.

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

The plugin runs server code in a browser tab. The surface is closer than it looks: Node.js has most of the web APIs a tab has, and server code that keeps to those runs in a tab too.

- `vitestPluginRSC()` provides `node:async_hooks`, with an `AsyncLocalStorage` that works for one request at a time.
- `vitestPluginNext()` adds what Next's own server needs of Node.js: `Buffer`, `process.env`, the modules `buffer`, `events`, `assert`, `util`, `path` and `stream` from the builds Next ships, and of `crypto` the random values and SHA-256.

A fast test should not touch the real database, file system or network. Keep IO inside the tab:

- **Database**: an in-memory implementation like [PGlite](https://pglite.dev/) for Postgres or [sql.js](https://github.com/sql-js/sql.js) for SQLite.
- **File system**: an in-memory implementation like [`memfs` via Vitest](https://vitest.dev/guide/mocking/file-system).
- **HTTP**: a request interceptor like [MSW in Vitest browser mode](https://mswjs.io/docs/recipes/vitest-browser-mode), or a mocked module.

Where you have a choice, use the APIs that Node and browsers share: Web Streams, `Uint8Array`, Web Crypto, `Blob` and `File`, and `fetch`, `Request`, `Response`, `Headers`, `URL` and `FormData`.

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

Next.js is a build and a runtime. Only the build is tied to a bundler. The plugin does the build with Vite, and asks Next's own build code for everything that is not bundling: the routes, the loader tree of a route, its request handler, the compile-time constants, the module aliases, and the compile of your source files with Next's SWC transform and its font and image loaders. Behind those, Next's runtime runs unchanged.

Next compiles an app into three layers, each with its own module graph and its own build of React. Each is a Vite environment here, and all three run in the test's tab:

| Layer     | Runs                                              | Vite environment |
| --------- | ------------------------------------------------- | ---------------- |
| `rsc`     | Server Components, Server Actions, route handlers | `client`         |
| `ssr`     | The request handler of a page, the HTML renderer  | `next_ssr`       |
| `browser` | Next's router, your Client Components             | `react_client`   |

The test runs in `client`, the Vite environment of the `rsc` layer. That is why a module your test imports is the instance your Server Components read.

[docs/next-routes.md](docs/next-routes.md) is the full description: what comes from Next, what its compiler does to your code, how a request travels, what stands in for a server, caching, how server code is told it is on a server, and what is checked of the installed Next.js. [docs/architecture.md](docs/architecture.md) describes the part without Next.js: the two environments and the module runner between them.

## What Does Not Work Yet

- Metadata files like `icon.png` and `sitemap.ts`. A run warns about the metadata files of the app, apart from `favicon.ico`, when it starts.
- A `webpack` function or `turbopack` rules in `next.config`, like `@svgr/webpack` and `@next/mdx`, a Babel config, and the React Compiler.
- A CommonJS source file in the app.
- The files of `.env` and `NEXT_PUBLIC_` variables: `process.env` in the tab is empty unless a test or a setup file fills it.
- `middleware.ts` / `proxy.ts`, and the redirects, rewrites and headers of `next.config`.
- `"use cache"`. And inside a function cached with `unstable_cache`, after its first `await`, the request's store is read instead of the cache's.
- A mock for Client Components.
- Next's edge runtime, which Next has deprecated. The server runs as on Node.js, Next's default, also for a route with `export const runtime = "edge"`.
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
