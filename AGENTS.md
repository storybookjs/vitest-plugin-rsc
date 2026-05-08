# Repository Guidance

## Commit And PR Titles

Use Conventional Commits for PR titles and squash commit titles. Release Please reads commits on `main` to decide versions, generate changelogs, create GitHub releases, and publish npm packages.

Good title examples for this repo:

- `feat: add RSC test helper`
- `fix: resolve Next.js cache mock`
- `perf: reduce plugin startup work`
- `chore: update Vite and Vitest tooling`
- `feat!: remove deprecated testing API`

While the package is pre-1.0, breaking changes are acceptable when intentional. Mark them with `!` in the type, such as `feat!: ...`, or add a `BREAKING CHANGE:` footer to the squash commit body.

## Releases

Official npm `latest` releases are created by Release Please after its release PR is merged. Do not add long-lived npm token publishing or publish PR commits to npm `latest`.

Preview packages for PR commits are handled by `pkg.pr.new`, which publishes installable preview URLs outside the npm registry.

## Testing

For bigger feature work, run `pnpm test:epic` so the plugin is built, copied into `~/code/epic-rsc-stack`, and verified against that stack with `bun vitest run`.
