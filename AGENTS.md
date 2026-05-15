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

Vitest projects that import `vitest-plugin-rsc` use the package exports, so build the package before running Vitest directly. From the root, prefer `pnpm test`, which runs `pnpm build` before the root Vitest project suite. If you intentionally bypass the script with `pnpm test:run`, run `pnpm build` first.

Keep Vitest project definitions and coverage settings in the root `vitest.config.ts`. Vitest coverage is process-level config, so do not add `coverage` blocks to individual project configs.

For bigger feature work, run the full Next.js notes demo suite from the root (`pnpm test --project nextjs-notes-demo-browser --project nextjs-notes-demo-node`) before merging. It is the in-tree acceptance app and covers the realistic combinations of routing, cookies, cache, Server Actions, and MSW-routed transport.
