# vitest-plugin-rsc

> Test React Server Components and Next.js App Router apps in Vitest Browser Mode.

[![npm version](https://img.shields.io/npm/v/vitest-plugin-rsc/alpha?color=cb3837&label=npm%40alpha)](https://www.npmjs.com/package/vitest-plugin-rsc?activeTab=versions)
[![CI](https://github.com/storybookjs/vitest-plugin-rsc/actions/workflows/ci.yml/badge.svg)](https://github.com/storybookjs/vitest-plugin-rsc/actions/workflows/ci.yml)
[![License](https://img.shields.io/npm/l/vitest-plugin-rsc)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D24-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-11-F69220?logo=pnpm&logoColor=white)](https://pnpm.io/)

`vitest-plugin-rsc` runs your server code in your test's browser tab. For a Next.js app, that means the whole app: Next's own request handler renders the route, the browser shows the HTML, Next's own client code hydrates it, and Server Actions run on Next's own server code. Nothing in Next.js is mocked, and there's no server to start.

So a single test can cover a slice of your app that unit tests and E2E tests struggle to reach:

**DB → RSC → pixels → actions → DB → pixels. One slice at a time.**

Pick one piece of your app, such as a notes form, a settings panel or a whole route. Seed exactly the state it needs and render it. Then use the hydrated UI in a real browser, run its Server Actions, and assert on what the user sees and what the server stored.

```tsx
test("archive a note", async () => {
  // seed DB
  await signedInAs(testUser);
  await db.insert(notes).values({ ownerId: testUser.id, title: "Inbox triage" });

  // RSC -> pixels
  await renderServer({ url: "/notes" });
  await expect.element(page.getByText("Inbox triage")).toBeVisible();

  // action -> DB -> pixels
  await page.getByRole("button", { name: "Archive Inbox triage" }).click();
  await expect.element(page.getByText("Inbox triage")).not.toBeInTheDocument();
});
```

The `db` the test seeds is the same module instance that the Server Component reads. In the notes demo, the database behind it is Postgres, compiled to WebAssembly, running in the tab.

## Why this exists

You can't cover every state of an app with E2E tests alone. They're slow, because each test has to drive the UI into the state it checks. They're hard to run in parallel, because they share a server and a database. And they're flaky, because they aren't isolated from each other. So validation errors, roles, locales, feature flags, empty and error states, and anything that depends on the time mostly go untested. That coverage belongs at the base of the test pyramid.

<p align="center">
  <img src="docs/assets/test-pyramid.svg" alt="Test pyramid: a small Playwright E2E layer above a wider Vitest unit, component, and integration layer" width="760" />
</p>

For Server Components, that base has been missing. Rendering them in a unit-style test has been [an open problem since 2023](https://github.com/testing-library/react-testing-library/issues/1209), so the whole RSC pipeline was left to E2E tests, which is exactly where broad coverage doesn't fit.

`vitest-plugin-rsc` fills that gap. A component, a form or a whole route runs through the full pipeline: server render, Flight, HTML, hydration, Server Action and rerender. Your test sets up its inputs directly, like database rows, cookies, headers and the clock, and asserts on the rendered DOM with `vitest/browser`: Playwright's locators, like `getByRole` and `getByText`, and the `expect.element` matchers.

Nothing has to be deployed for a test, and that changes how tests behave:

- **What the server talks to lives in the tab too.** The file system is an in-memory disk, a [database recipe](docs/databases.md) runs a real database engine in WebAssembly, and a request to another server goes wherever [MSW](https://mswjs.io/docs/recipes/vitest-browser-mode) sends it.
- **Test files run in parallel.** Vitest gives each worker its own browser tab, and each tab has its own server, database, disk, cookies and storage, so you don't need a shared test database.
- **Every test starts from the same state.** Before each test, the plugin empties the disk and Next's Data Cache, and opens a fresh browser context for your app, with no cookies and empty `localStorage` and `sessionStorage`. A database recipe also resets the database and fixes the clock. See [Test isolation](docs/nextjs-guide.md#test-isolation).

A fast, deterministic test file is also what a coding agent needs: edit, run the tests, fix, repeat. Server Components have been the hardest part of React to put in that loop.

### Does it behave like Next.js?

The plugin doesn't reimplement Next.js. It builds your app with Vite, asks Next's own build code for everything else, and runs Next's runtime unchanged. To check how close that gets, the repository runs a selection of Next's own e2e tests, from `test/e2e/app-dir` in [vercel/next.js](https://github.com/vercel/next.js), against the plugin: of the 474 that apply, **402 pass (85%)**, measured against `next@16.4.0`. Every test that fails is listed with the reason, in [docs/next-conformance.md](docs/next-conformance.md).

The plugin calls Next.js internals, so CI also runs its own suite against `next@16.4.0`, `next@latest` and `next@canary`.

## Quick start

### Requirements

- Vite 8 or later, and Vitest 5.0.4 or later in [Browser Mode](https://vitest.dev/guide/browser/). The examples use Playwright as the browser provider.
- A Next.js App Router app on `next@16.4` or later, and [`@next/routing`](https://www.npmjs.com/package/@next/routing), Next's own route resolution, at the same version as `next`.

Vitest isn't the only possible host. Another one, such as a component workshop, can run the plugin in its own Vite server: see [Another Host Than Vitest](docs/next-routes.md#another-host-than-vitest).

### 1. Install

```bash
npm install -D vitest-plugin-rsc@alpha vitest @vitest/browser-playwright playwright @types/node@24
# Next's own route resolution, at the same version as your `next`
npm install -D -E @next/routing@$(node -p "require('next/package.json').version")
# The browser that the tests run in
npx playwright install chromium
```

The plugin is in alpha, so its releases are on the `alpha` dist-tag, and an alpha can break its API. `@next/routing` has to be the same version as your `next`, so upgrade them together, as you would `eslint-config-next`. Vitest 5 needs `@types/node` 22 or later, and create-next-app installs 20, so the first line upgrades it.

### 2. Configure Vitest

```ts
// vitest.config.mts
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";
import { vitestPluginRSC } from "vitest-plugin-rsc";
import { vitestPluginNext } from "vitest-plugin-rsc/nextjs/plugin";

export default defineConfig({
  plugins: [vitestPluginRSC(), vitestPluginNext()],
  test: {
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: "chromium" }],
    },
    include: ["**/*.test.{ts,tsx}"],
    isolate: false,
  },
});
```

`vitestPluginNext()` reads your app from the project root. You don't need a setup file, because the plugin cleans up before and after every test.

`isolate: false` loads your app's server once per worker instead of once per test file. It also means the test files in a worker share their modules, and so their mocks, which is why mocks belong in a setup file (see [Mocks](docs/nextjs-guide.md#mocks)).

The `.mts` extension makes Vite load the config as ES modules, which a create-next-app project without `"type": "module"` needs. `include` keeps Playwright's `*.spec.ts` files out of the run. Add `.vitest/` to your `.gitignore`: Vitest writes the screenshots of failed tests there.

### 3. Write a test

Here's a Server Component that reads a cookie and updates it from a Server Action:

```tsx
// app/likes.tsx
import { cookies } from "next/headers";

export async function Likes() {
  const likes = Number((await cookies()).get("likes")?.value ?? 0);

  return (
    <form
      action={async () => {
        "use server";
        (await cookies()).set("likes", String(likes + 1));
      }}
    >
      <button>Likes: {likes}</button>
    </form>
  );
}
```

And a test file next to it:

```tsx
// app/likes.test.tsx
import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { Likes } from "./likes";

test("likes from a Server Action", async () => {
  await renderServer(<Likes />, { headers: { cookie: "likes=41" } });

  await page.getByRole("button", { name: "Likes: 41" }).click();
  await expect.element(page.getByRole("button", { name: "Likes: 42" })).toBeVisible();
});

test("opens the home page", async () => {
  const { response } = await renderServer({ url: "/" });

  expect(response.status).toBe(200);
});
```

The first test renders one component, the way Testing Library would, but on Next's server. The `cookie` header goes into the request, the click runs the Server Action, and Next renders the component again with the new cookie. The second test opens your home page the way a browser does, through Next's request handler, and waits until it has hydrated.

### 4. Run it

```bash
npx vitest
```

Vitest starts Chromium, runs both tests in it, and keeps watching your files. Use `npx vitest run` for a single run, as in CI. Each worker loads Next's runtime once, before its first test.

## What you can test

Your files go through Next's own SWC transform and its font and image loaders, so `next/font`, `next/image`, `next/dynamic` and styled-jsx work, and a mistake that would break `next build` fails the test with Next's error. Routes, layouts, `loading.tsx`, error boundaries, redirects, cookies, Server Actions, route handlers, the Data Cache, `proxy.ts`, and the redirects, rewrites and headers in `next.config` all run as they do in Next.

The [Next.js guide](docs/nextjs-guide.md) covers each of these:

- **[A component](docs/nextjs-guide.md#render-a-component)** with `renderServer(<Node />)`, optionally wrapped in providers, inside your layouts, or behind your proxy.
- **[A whole route](docs/nextjs-guide.md#open-a-whole-route)** with `renderServer({ url })`, including navigation with `next/link` and the router.
- **[Forms and Server Actions](docs/nextjs-guide.md#forms-and-server-actions)**, with server-side and browser-side state seeded in the same test.
- **[Router hooks and links](docs/nextjs-guide.md#router-hooks-and-links)**: `usePathname`, `useSearchParams`, `useParams` and `next/link`.
- **[Headers and cookies](docs/nextjs-guide.md#headers-and-cookies)**, set per test and kept the way a browser keeps them.
- **[localStorage and sessionStorage](docs/nextjs-guide.md#localstorage-and-sessionstorage)**, empty for every test.
- **[Caching](docs/nextjs-guide.md#caching-and-revalidation)**: cached `fetch`, `revalidateTag()`, `updateTag()`, `refresh()` and `"use cache"`.
- **[Route handlers](docs/nextjs-guide.md#route-handlers)** and raw responses with `handleRequest()`.
- **[Code that a Server Action calls](docs/nextjs-guide.md#code-that-a-server-action-calls)** with `runInServerAction()`, without opening a page.
- **[The proxy, redirects and rewrites](docs/nextjs-guide.md#the-proxy-redirects-and-rewrites)** from `proxy.ts` and `next.config`.
- **[Mocks](docs/nextjs-guide.md#mocks)** of the modules your server code imports.
- **[Fonts, images and styles](docs/nextjs-guide.md#fonts-images-and-styles)**, compiled by Next.
- **[Design-system Client Components](docs/use-client-test-files.md)** on their own, in a test file with `"use client"`.
- **[Node.js APIs](docs/nodejs-in-the-browser.md)** that a browser can provide, and an in-memory `fs` that the test shares with the server.
- **[Environment variables](docs/nextjs-guide.md#environment-variables)** from your test env files.

In watch mode, saving a file of your app reruns the test files that open a route: see [Watch mode](docs/nextjs-guide.md#watch-mode).

## Databases

There are no TCP sockets in a browser, so your database runs in the tab instead: a real engine in WebAssembly. [`playground/nextjs-db-recipes`](playground/nextjs-db-recipes) has a recipe for each database and ORM. Your app keeps its ORM, its queries and its migrations, and the tests mock one module, `db.ts`.

|                                  | Drizzle | Prisma | Kysely | SQL |
| -------------------------------- | ------- | ------ | ------ | --- |
| Postgres, on PGlite              | ✅      | ✅     | ✅     | ✅  |
| SQLite, on `@libsql/client-wasm` | ✅      | ✅     | ✅     | ✅  |
| MySQL, on MariaDB in WebAssembly | ✅      | ✅     | ✅     | ✅  |

There's a Redis recipe for `ioredis` too. See [Databases](docs/databases.md) for how a recipe works and how to use one in your app.

## Storybook

Storybook needs no server either. With [`@storybook/nextjs-vite-rsc`](packages/storybook-nextjs-vite-rsc), a story renders a page of your app with the same mocks as the tests, and a static Storybook build carries the database in the tab. In a deployed Storybook, a form submits and its Server Action writes to that database, and every story starts from an empty one. Storybook's Vitest addon runs every story as a test, and a test can import a story and run it. The notes demo, `playground/nextjs-notes-demo`, is built that way.

## React Server Components without Next.js

`vitestPluginRSC()` on its own renders Server Components for any React app. There's no request and no router: `renderServer` from `vitest-plugin-rsc/testing-library` renders a node to a Flight stream and reads it back in the same test runtime. See [RSC without Next.js](docs/rsc-without-nextjs.md).

## How it works

Next.js is a build and a runtime, and only the build is tied to a bundler. That's why the plugin can replace the build and keep the runtime. Routing, the proxy and the `next.config` redirects come from Next's own `@next/routing`.

Next compiles an app into three layers, each with its own module graph and its own build of React. Here each layer is a Vite environment, and all three run in the browser:

| Layer     | Runs                                                                                     | Vite environment |
| --------- | ---------------------------------------------------------------------------------------- | ---------------- |
| `rsc`     | Server Components, Server Actions, route handlers, deciding which requests go to the app | `client`         |
| `ssr`     | Next's route module, the HTML renderer, the server in front of the app                   | `next_ssr`       |
| `browser` | Next's router, your Client Components                                                    | `react_client`   |

Your test runs in `client`, the `rsc` layer's environment. That's why a module your test imports is the same instance your Server Components read. A test file with `"use client"` runs in `react_client`, without a page of your app.

For the full walkthrough, see [Next.js: How It Works](docs/next-routes.md). [docs/architecture.md](docs/architecture.md) covers the part without Next.js: the two environments and the Module Runner bridge between them.

## Limitations

The plugin runs Next's real runtime, but in a browser tab, and that has consequences:

- **No `test.concurrent`.** Tests within a file run one after another, because concurrent tests would share Next's request context. Test files still run in parallel. See [Test isolation](docs/nextjs-guide.md#test-isolation).
- **One request at a time.** A request that waits for another request the test hasn't sent yet waits forever.
- **No native addons or TCP sockets.** Use a [database recipe](docs/databases.md), a JavaScript or WebAssembly alternative, or MSW. A Node.js function the plugin has no stand-in for throws when called: see [Node.js in the browser](docs/nodejs-in-the-browser.md).
- **No Next router or Server Actions in a `"use client"` test file**, and no `vi.mock()` there: see [Testing Client Components](docs/use-client-test-files.md).
- **Not yet supported**: metadata files like `icon.png` and `sitemap.ts`, custom `webpack` or `turbopack` loaders, a Babel config, and the React Compiler, among others.
- **React's development build by default.** An error that a Server Component throws reaches the client with its message, where a deployment sends a digest. `build: "production"` behaves like a deployment: see [Development or production](docs/nextjs-guide.md#development-or-production).

The full list, with the reason for each, is in [Not Yet](docs/next-routes.md#not-yet), and the conformance suite lists every Next.js e2e test that doesn't pass in [docs/next-conformance.md](docs/next-conformance.md).

## Documentation

- [Testing a Next.js app](docs/nextjs-guide.md): the guide, with examples for every feature.
- [Testing Client Components in a `"use client"` test file](docs/use-client-test-files.md).
- [Node.js in the browser](docs/nodejs-in-the-browser.md): the Node.js modules your server code gets, and the in-memory disk.
- [Databases](docs/databases.md): Postgres, SQLite, MySQL and Redis in the tab.
- [A static build](docs/static-build.md): `vite build`, and how to serve it.
- [API reference](docs/api.md).
- [React Server Components without Next.js](docs/rsc-without-nextjs.md).
- [Next.js: How It Works](docs/next-routes.md) and [Architecture](docs/architecture.md): how the plugin works inside.
- [Next.js conformance](docs/next-conformance.md): Next's own e2e tests, run against the plugin.
- [Performance benchmarks](docs/performance.md) and [Releasing](docs/releasing.md), for contributors.

## Contributing

The playgrounds are the plugin's test bed, and most samples in the docs come from their tests:

- `playground/nextjs-e2e-demo`: a small Next.js app with a test for every feature of the Next.js support. Its `build-test/` builds the app with `vite build` and opens the build in a browser: see [A static build](docs/static-build.md).
- `playground/nextjs-cache-components-demo`: a small Next.js app with `cacheComponents`, for `"use cache"`.
- `playground/nextjs-notes-demo`: a fuller Next.js notes app with Better Auth, Drizzle, PGlite test databases and shadcn/ui. Its tests open whole routes, with the database mocked in the test runtime and the rest of the app real, and a test signs in with a Better Auth session on that database. This is the repository's acceptance app.
- `playground/nextjs-db-recipes`: a recipe for each database and ORM: Postgres, SQLite and MySQL, with Drizzle, Prisma, Kysely or plain SQL on the app's driver, and Redis with ioredis. See [Databases](docs/databases.md).
- `playground/rsc-vitest-demo`: a minimal RSC app without Next.js, and the smallest end-to-end example of the plugin on its own. Its `build-test/` builds the `host/main.tsx` page with `vite build` and opens the build in a browser.
- `playground/nextjs-host-demo`: the Next.js plugin in a Vite dev server without Vitest, the way another host runs it. Its tests start that server and drive it with Playwright. See [Another Host Than Vitest](docs/next-routes.md#another-host-than-vitest).

The Vitest projects are wired up in the root `vitest.config.ts`, and each package and playground has its own config:

```bash
pnpm test
pnpm test --project nextjs-e2e-demo
pnpm test --project nextjs-notes-demo-browser
pnpm test playground/nextjs-e2e-demo/app/cookies.test.tsx
pnpm test:slow
```

`pnpm test` runs the fast projects. `pnpm test:slow` runs the ones that start a dev server, `storybook dev`, `storybook build` or a static build, and `pnpm test:all` runs every project. A file or a `--project` on the command line selects from every project.

`VITEST_PLUGIN_RSC_BUILD=production` runs the e2e demo, the notes demo and the database recipes the way `next start` would, and CI runs them that way too. See [AGENTS.md](AGENTS.md) for the repository's conventions on commits, releases and testing.
