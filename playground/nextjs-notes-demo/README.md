# Notes Demo

This playground is a small Next.js App Router notes app used to exercise React Server Components with `vitest-plugin-rsc`. It is the acceptance app of this repository: a Next.js app with Better Auth, Drizzle on Postgres, Server Actions and flash cookies.

A browser test opens a route with `renderServer({ url })` from `vitest-plugin-rsc/nextjs/testing-library`, and Next's own request handler, renderer and router do the rest, in the browser test runtime. A page story, `app/**/page.stories.tsx`, renders a page the same way in Storybook.

The tests and the stories mock two modules. The database, `#lib/db.ts`, which is the app's Postgres: in its place they have a PGlite database in memory, one per document, which each test and story empties first (`lib/__mocks__/db.ts`). The clock, `#lib/clock.ts`, which the app reads the date of a note from: in its place they have one fixed instant (`lib/__mocks__/clock.ts`), so a note that a test or a story writes shows the same date on every run. Both with `vi.mock()` in `vitest.setup.ts` and `sb.mock()` in `.storybook/preview.tsx`. Everything else is the app's own: Better Auth on that database, its session cookie, `cookies()` and `headers()` of each request, the flash cookies of the forms, redirects. A test signs a user in with `signedInAs()` of `test/auth.ts`, as Better Auth would have: a session in the database and its signed cookie.

- `app/**/page.test.tsx` open the pages of the app.
- `components/*.test.tsx` render a probe component on its own, with `renderServer(<Probe />, { url })`: in a container, without the layouts of the app, with the params the app's route for the URL has.
- `components/next-cache.test.tsx` covers Next's Data Cache: `unstable_cache`, cached `fetch` and what invalidates them.

## Development

`pnpm dev` runs on Postgres at `DATABASE_URL`, and shows `SUPPORT_EMAIL`, both in `.env.local` (see `.env.example`). The tests and the stories read `.env.test` instead. A Postgres in Docker:

```bash
docker run -d --name notes-demo-postgres -p 5432:5432 \
  -e POSTGRES_PASSWORD=postgres postgres:17
echo 'DATABASE_URL="postgres://postgres:postgres@localhost:5432/postgres"' > .env.local
echo 'SUPPORT_EMAIL="support@notes.example"' >> .env.local
pnpm db:push
pnpm dev
```

`pnpm db:push` makes the tables of `db/schema.ts`. Sign up with any email address: without Resend, `pnpm dev` prints the magic link in the terminal.

## Commands

```bash
pnpm dev
pnpm build
pnpm storybook
pnpm --dir ../.. test:run --project nextjs-notes-demo-browser
```
