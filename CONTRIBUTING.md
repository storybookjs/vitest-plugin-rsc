# Contributing

Thanks for helping out! The repo's conventions for commits, releases and testing are in [AGENTS.md](AGENTS.md). Humans: it's for you too.

## The playgrounds

The playgrounds are the plugin's test bed, and most examples in the docs come from their tests.

| Playground                                | What it is                                                                                                                                 |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `playground/nextjs-e2e-demo`              | A small Next.js app with a test for every feature. Its `build-test/` checks a static build in a browser.                                   |
| `playground/nextjs-cache-components-demo` | A small app with `cacheComponents`, for `"use cache"`.                                                                                     |
| `playground/nextjs-notes-demo`            | The acceptance app: a fuller notes app with Better Auth, Drizzle, PGlite and shadcn/ui. Its tests open whole routes. Also has a Storybook. |
| `playground/nextjs-db-recipes`            | A recipe for each database and ORM. See [Databases](docs/databases.md).                                                                    |
| `playground/rsc-vitest-demo`              | A minimal RSC app without Next.js. The smallest end-to-end example.                                                                        |
| `playground/nextjs-host-demo`             | The plugin in a plain Vite dev server, the way a host other than Vitest runs it.                                                           |

## Running tests

The scripts run on [Bun](https://bun.sh), at the version of `.bun-version`, and pnpm on Node.js: install both.

```bash
pnpm test                                          # the fast projects, under a minute
pnpm test playground/nextjs-e2e-demo/app/cookies.test.tsx   # one file
pnpm test --project nextjs-e2e-demo                # one project
pnpm test:slow                                     # dev servers, Storybook, static builds
pnpm test:all                                      # everything
```

Run the tests your change is about. CI runs the whole suite on every push.

`VITEST_PLUGIN_RSC_BUILD=production` runs the e2e demo, the notes demo and the database recipes like `next start` would. CI does both.

Before you push: `pnpm format`, `pnpm lint`, `pnpm tsgo` and `pnpm build`.

## Learning how it works

Start with [the internals](docs/internals/README.md).
