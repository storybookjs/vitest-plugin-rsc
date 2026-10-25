# vitest-plugin-rsc

> Test React Server Components and Next.js App Router apps in Vitest Browser Mode.

[![npm version](https://img.shields.io/npm/v/vitest-plugin-rsc/alpha?color=cb3837&label=npm%40alpha)](https://www.npmjs.com/package/vitest-plugin-rsc?activeTab=versions)
[![CI](https://github.com/storybookjs/vitest-plugin-rsc/actions/workflows/ci.yml/badge.svg)](https://github.com/storybookjs/vitest-plugin-rsc/actions/workflows/ci.yml)
[![License](https://img.shields.io/npm/l/vitest-plugin-rsc)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D24-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-11-F69220?logo=pnpm&logoColor=white)](https://pnpm.io/)

Write a test, render a page of your Next.js app, click around, check the database. No dev server, no deployment, no mocks of Next.js.

```tsx
test("archive a note", async () => {
  await signedInAs(testUser);
  await db.insert(notes).values({ ownerId: testUser.id, title: "Inbox triage" });

  await renderServer({ url: "/notes" });
  await expect.element(page.getByText("Inbox triage")).toBeVisible();

  await page.getByRole("button", { name: "Archive Inbox triage" }).click();
  await expect.element(page.getByText("Inbox triage")).not.toBeInTheDocument();
});
```

That test seeds a database, renders the `/notes` route on the server, hydrates it in a real browser, runs a Server Action and checks the result. All in one browser tab.

The trick: the plugin runs your server code _in the test's browser tab_. Next's own request handler renders the route, Next's own client hydrates it, and the `db` your test seeds is the very same module your Server Components read. In the notes demo, that database is Postgres compiled to WebAssembly.

## Why

Server Components have been hard to test. Rendering one in a unit test has been [an open problem since 2023](https://github.com/testing-library/react-testing-library/issues/1209), so they've mostly been left to E2E tests. And E2E tests are slow, share a server and a database, and get flaky. That's why validation errors, roles, empty states, feature flags and time-dependent code usually go untested.

<p align="center">
  <img src="docs/assets/test-pyramid.svg" alt="Test pyramid: a small Playwright E2E layer above a wider Vitest unit, component, and integration layer" width="760" />
</p>

This plugin moves that coverage down to the fast part of the pyramid:

- **Everything lives in the tab.** The file system is in memory, the database is a [real engine in WebAssembly](docs/databases.md), and outgoing requests go to [MSW](https://mswjs.io/docs/recipes/vitest-browser-mode).
- **Test files run in parallel.** Every Vitest worker gets its own tab, with its own server, database, disk, cookies and storage.
- **Every test starts clean.** Cookies, storage, the disk and Next's cache are reset before each test.

That also makes it a nice loop for coding agents: edit, run, fix, repeat.

### Is it really Next.js?

Yes. The plugin doesn't reimplement Next. It swaps the bundler for Vite and runs Next's runtime unchanged. To keep that honest, the repo runs Next's own e2e tests against the plugin: **402 of the 474 that apply pass (85%)** on `next@16.4.0`. Every failure is listed with a reason in the [conformance report](docs/internals/next-conformance.md). CI also tests against `next@latest` and `next@canary`.

## Quick start

You need:

- Vite 8+ and Vitest 5.0.4+ in [Browser Mode](https://vitest.dev/guide/browser/) (the examples use Playwright).
- A Next.js App Router app on `next@16.4` or later.

### 1. Install

```bash
npm install -D vitest-plugin-rsc@alpha vitest @vitest/browser-playwright playwright @types/node@24
# Next's route resolution, pinned to your `next` version
npm install -D -E @next/routing@$(node -p "require('next/package.json').version")
npx playwright install chromium
```

A few notes:

- The plugin is in **alpha**. Releases live on the `alpha` tag and the API can still change.
- `@next/routing` must match your `next` version exactly. Upgrade them together.
- Vitest 5 needs `@types/node` 22+, and create-next-app installs 20, hence the bump.

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

- No setup file needed: the plugin cleans up around every test.
- `isolate: false` loads your app's server once per worker instead of once per file. It does mean the test files in a worker share modules, so put mocks in a [setup file](docs/nextjs-guide.md#mocks).
- `.mts` makes the config load as ESM, which matters if your `package.json` has no `"type": "module"`.
- `include` keeps Playwright's `*.spec.ts` files out.
- Add `.vitest/` to `.gitignore`. That's where screenshots of failed tests go.

### 3. Write a test

A Server Component that reads a cookie and bumps it from a Server Action:

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

And its test:

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

The first test renders a single component, Testing Library style, but on Next's server. The click runs the Server Action, and Next renders again with the new cookie. The second test opens your home page like a browser would.

### 4. Run it

```bash
npx vitest
```

Vitest starts Chromium and watches your files. Use `npx vitest run` in CI. The first test in each worker is a bit slower, because it loads Next's runtime.

## What you can test

Pretty much everything Next does. Your files go through Next's own compiler, so `next/font`, `next/image`, `next/dynamic` and styled-jsx just work, and a mistake that would break `next build` breaks your test too. Routes, layouts, `loading.tsx`, error boundaries, redirects, cookies, Server Actions, route handlers, caching and `proxy.ts` all behave as they do in Next.

Head to the **[Next.js guide](docs/nextjs-guide.md)** for an example of each.

For a quicker feedback loop, `VITEST_PLUGIN_RSC_MODE=fast npx vitest` runs in [fast mode](docs/nextjs-guide.md#fast-mode): the pages of a test file render in one app, without HTML from the server, prefetching or page loads. Keep CI in fidelity mode, the default. [Fast testing patterns](docs/fast-testing-patterns.md) has what each test costs, and what else makes it cheaper.

### Databases

Browsers have no TCP sockets, so the database runs in the tab: a real engine in WebAssembly. Your app keeps its ORM, queries and migrations. Tests mock just one module, `db.ts`.

|                                  | Drizzle | Prisma | Kysely | SQL |
| -------------------------------- | ------- | ------ | ------ | --- |
| Postgres, on PGlite              | ✅      | ✅     | ✅     | ✅  |
| SQLite, on `@libsql/client-wasm` | ✅      | ✅     | ✅     | ✅  |
| MySQL, on MariaDB in WebAssembly | ✅      | ✅     | ✅     | ✅  |

There's a Redis recipe for `ioredis` too. See [Databases](docs/databases.md).

### Storybook

[`@storybook/nextjs-vite-rsc`](packages/storybook-nextjs-vite-rsc) brings the same thing to Storybook. A story can render a whole page of your app, with the same mocks as your tests. Even a static, deployed Storybook carries its database along, so forms really submit.

### Without Next.js

`vitestPluginRSC()` on its own renders Server Components for any React app. See [RSC without Next.js](docs/rsc-without-nextjs.md).

## Good to know

It's Next's real runtime, but in a browser tab. A few things follow from that:

- **No `test.concurrent`.** Tests in one file run one after another. Files still run in parallel.
- **No native addons or TCP sockets.** Use a [database recipe](docs/databases.md), a WebAssembly alternative, or MSW.
- **Development React by default.** A Server Component's error message reaches the client, where a deployment would send a digest. Use [`build: "production"`](docs/nextjs-guide.md#development-or-production) to match a deployment.
- **Some Next features aren't supported yet**, like `opengraph-image` image rendering, the React Compiler and most custom `webpack` config.

The full list is in [Limitations](docs/limitations.md).

## Documentation

**Guides**

- [Testing a Next.js app](docs/nextjs-guide.md): the main guide.
- [Testing Client Components](docs/use-client-test-files.md) in a `"use client"` test file.
- [Databases](docs/databases.md): Postgres, SQLite, MySQL and Redis in the tab.
- [Fast testing patterns](docs/fast-testing-patterns.md): how to make a suite fast, and what each pattern costs and gives up.
- [Fast tests](docs/fast-tests.md): the measurements behind them, and the quickest feedback loop.
- [Node.js in the browser](docs/nodejs-in-the-browser.md): which Node APIs work, and the in-memory disk.
- [Static builds](docs/static-build.md): `vite build`, and how to serve the result.
- [RSC without Next.js](docs/rsc-without-nextjs.md).

**Reference**

- [API reference](docs/api.md)
- [Limitations](docs/limitations.md)

**Under the hood**

- [Internals](docs/internals/README.md): how it all works, the Next.js conformance suite, benchmarks and releasing. Detailed, and mostly for contributors.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).
