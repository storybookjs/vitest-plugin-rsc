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

Official npm `latest` releases are created by Release Please after its release PR is merged. Do not add long-lived npm token publishing or publish PR commits to npm `latest`.

Preview packages for PR commits are handled by `pkg.pr.new`, which publishes installable preview URLs outside the npm registry.

## Testing

Vitest projects that import `vitest-plugin-rsc` use the package exports. From the root, prefer `pnpm test`, which runs the root Vitest project suite against the source of the package. `pnpm test:dist` and Vitest run directly use the built package, so run `pnpm build` first.

Keep Vitest project definitions and coverage settings in the root `vitest.config.ts`. Vitest coverage is process-level config, so do not add `coverage` blocks to individual project configs.

For bigger feature work, run the full Next.js notes demo suite from the root (`pnpm test --project nextjs-notes-demo-browser --project nextjs-notes-demo-node`) before merging. It is the in-tree acceptance app: its tests open the routes of the app with `renderServer({ url })` and cover the realistic combinations of routing, cookies, forms, Server Actions and third-party client packages.

`pnpm conformance` runs fixtures of Next's own e2e tests against the plugin, see `docs/next-conformance.md`. It is not a part of `pnpm test`: it fetches the fixtures from `vercel/next.js` and takes minutes. Run it after a change to how the plugin runs Next.js. A test that starts or stops passing fails it; `pnpm conformance --update` records the change in `conformance/expectations.json`, where every failing test has a reason.
