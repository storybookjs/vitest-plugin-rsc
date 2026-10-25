# Repository Guidance

## Commit And PR Titles

Use Conventional Commits for PR titles and for commits that land on `main`. Release Please reads commits on `main` to decide versions, generate changelogs, create GitHub releases, and publish npm packages.

Every commit that lands on `main` should be meaningful for the changelog or review history. Squash noisy, mechanical, or intermediate commits when they are better represented as one release note.

Good title examples for this repo:

- `feat: add RSC test helper`
- `fix: resolve Next.js cache mock`
- `perf: reduce plugin startup work`
- `chore: update Vite and Vitest tooling`
- `feat!: remove deprecated testing API`

While the package is pre-1.0, breaking changes are acceptable when intentional. Mark them with `!` in the type, such as `feat!: ...`, or add a `BREAKING CHANGE:` footer to the relevant commit body.

## Releases

Official npm releases are created by Release Please after its release PR is merged. They are alphas for now, on the `alpha` dist-tag: see `docs/internals/releasing.md`. Do not add long-lived npm token publishing or publish PR commits to npm `latest`.

Preview packages for PR commits are handled by `pkg.pr.new`, which publishes installable preview URLs outside the npm registry.

## Testing

Run the tests your change is about, by file. CI runs the whole suite on every push, drafts included, so a local run of every project is rarely worth its minutes.

```sh
pnpm test playground/nextjs-e2e-demo/app/cookies.test.tsx
```

The projects come in two tiers. `pnpm test` runs the fast tier, in under a minute. `pnpm test:slow` runs the slow tier, the projects that start a dev server, `storybook dev`, `storybook build` or a static build: `nextjs-host-demo*`, `nextjs-notes-demo-storybook*` and `*-build`, minutes. `pnpm test:all`, `pnpm test:dist` and CI run every project. A file or a `--project` on the command line selects from every project, whatever the tier: `pnpm test playground/nextjs-host-demo/test/storybook.test.ts` runs it. The root `vitest.config.ts` names the slow tier.

`pnpm test` runs the root Vitest project suite against the source of the package, but for its modules of Node.js (`packages/vitest-plugin-rsc/src/node/`), which are always the built files of `dist/node/`: `pnpm test` builds the package first. `pnpm test:dist` and Vitest run directly use the built package, so run `pnpm build` first. Before a push, run `pnpm format`, `pnpm lint`, `pnpm tsgo` and `pnpm build`.

The scripts run Vitest, Vite, the build, the formatter and the linters on Bun, `bun --bun`, at the version of `.bun-version`; pnpm itself runs on Node.js. Bun takes export conditions from its own `--conditions` only, not from `NODE_OPTIONS`. `pnpm test:run:node` and `pnpm test:dist:node` run the tests on Node.js.

Keep Vitest project definitions and coverage settings in the root `vitest.config.ts`. Vitest coverage is process-level config, so do not add `coverage` blocks to individual project configs.

The Next.js notes demo, `playground/nextjs-notes-demo`, is the in-tree acceptance app: its tests open the routes of the app with `renderServer({ url })` and cover the realistic combinations of routing, cookies, forms, Server Actions and third-party client packages, and its stories run in `storybook dev` and `storybook build`.

`pnpm conformance` runs fixtures of Next's own e2e tests against the plugin, see `docs/internals/next-conformance.md`. It is not a part of `pnpm test`: it fetches the fixtures from `vercel/next.js` and takes minutes. It runs in CI on `main`, after a push that changes the plugin, the runner or the lockfile, and once a week against `next@canary`; not on a pull request, as a run takes the runners of the other jobs for up to an hour and a half. Do not start it on a branch unless the owner asks for it. A test that starts or stops passing fails it; `pnpm conformance <fixture> --update` records the change in `conformance/expectations.json`, where every failing test has a reason.
