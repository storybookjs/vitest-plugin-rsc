# Notes demo

A small Next.js App Router notes app, and the acceptance app of this repository. It has Better Auth, Drizzle on Postgres, Server Actions and flash cookies: the realistic mix the plugin has to keep working.

Tests open routes with `renderServer({ url })` from `vitest-plugin-rsc/nextjs/testing-library`, and Next's own request handler, renderer and router do the rest, right in the browser. Page stories (`app/**/page.stories.tsx`) render pages the same way in Storybook.

## What's mocked

Only two things:

- **The database**, `#lib/db.ts`. Tests and stories get an in-memory PGlite database instead, one per document, emptied before each test or story. See `lib/__mocks__/db.ts`, mocked with `vi.mock()` in `vitest.setup.ts` and `sb.mock()` in `.storybook/preview.tsx`.
- **The clock**, frozen at `TEST_NOW` from `test/now.ts`, so a note shows the same date on every run. Tests use `vi.setSystemTime()` in `vitest.setup.ts`. Storybook uses `MockDate.set()` from [mockdate](https://github.com/boblauer/MockDate), as Storybook's docs suggest, in the `beforeAll` of `.storybook/preview.tsx`. The tests stop it before the database does any work, and keep it stopped through the tests of a file: PGlite's Postgres times its own timeouts by that clock, and a timeout that it armed by the real clock is months away by the stopped one, which leaves Postgres re-arming it in a busy loop.

Everything else is the real app: Better Auth on that database, its session cookie, `cookies()` and `headers()`, flash cookies and redirects. A test signs in with `signedInAs()` from `test/auth.ts`, which creates a session in the database and its signed cookie, just like Better Auth would.

## Where the tests are

- `app/**/page.test.tsx` open the app's pages.
- `components/*.test.tsx` render a single probe component with `renderServer(<Probe />, { url })`, without the layouts.
- `components/next-cache.test.tsx` covers Next's Data Cache: `unstable_cache`, cached `fetch` and what invalidates them.

## Running the app

`pnpm dev` needs a Postgres at `DATABASE_URL` and a `SUPPORT_EMAIL`, both in `.env.local` (see `.env.example`). Tests and stories read `.env.test` instead. With Docker:

```bash
docker run -d --name notes-demo-postgres -p 5432:5432 \
  -e POSTGRES_PASSWORD=postgres postgres:17
echo 'DATABASE_URL="postgres://postgres:postgres@localhost:5432/postgres"' > .env.local
echo 'SUPPORT_EMAIL="support@notes.example"' >> .env.local
pnpm db:push
pnpm dev
```

`pnpm db:push` creates the tables from `db/schema.ts`. Sign up with any email address: without Resend, the magic link is printed in the terminal.

## Commands

```bash
pnpm dev
pnpm build
pnpm storybook
pnpm --dir ../.. test:run --project nextjs-notes-demo-browser
```
