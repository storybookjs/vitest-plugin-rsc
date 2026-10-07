# PGlite Notes Demo

This playground is a small Next.js App Router notes app used to exercise React Server Components with `vitest-plugin-rsc`. It is the acceptance app of this repository.

A browser test opens a route with `renderServer({ url })` from `vitest-plugin-rsc/nextjs`, and Next's own request handler, renderer and router do the rest, in the test's tab. The tests mock the modules the server reads there, in `vitest.setup.ts`: the database (a PGlite clone per test), the session and the auth API.

- `app/**/page.test.tsx` open the pages of the app.
- `components/*.test.tsx` render a probe component in place of the page of a route, with `renderServer(<Probe />, { url })`. The routes under `app/fixtures` exist for these tests.
- `components/next-cache.test.tsx` covers Next's Data Cache: `unstable_cache`, cached `fetch` and what invalidates them.

It intentionally uses local PGlite + Drizzle instead of external services. Named scenarios seed the in-memory database on startup:

```bash
SCENARIO=empty pnpm dev
SCENARIO=notes-basic pnpm dev
SCENARIO=notes-many pnpm dev
```

`notes-basic` is the default so the app opens with realistic notes.

## Commands

```bash
pnpm dev
pnpm build
pnpm --dir ../.. test:run --project nextjs-notes-demo-browser --project nextjs-notes-demo-node
```
