# PGlite Notes Demo

This playground is a small Next.js App Router notes app used to exercise React Server Components with `vitest-plugin-rsc`.

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
