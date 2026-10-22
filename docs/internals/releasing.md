# Releasing

This repository has two release paths:

- Official npm releases use Release Please. Commits merged to `main` with Conventional Commit titles are collected into a release PR. When that release PR is merged, GitHub creates the release and the workflow publishes `vitest-plugin-rsc` to npm. A prerelease goes to the dist-tag of its kind, `alpha`, and any other release to `latest`.
- Preview packages use `pkg.pr.new`. Every `pull_request` update and every `main` push runs the preview workflow and publishes installable package URLs outside the npm registry.

## Required Setup

Configure npm trusted publishing for `vitest-plugin-rsc` before merging the first Release Please PR:

- npm package: `vitest-plugin-rsc`
- GitHub repository: `storybookjs/vitest-plugin-rsc`
- Workflow filename: `release-please.yml`
- Environment: `Release`

The release workflow intentionally does not use `NODE_AUTH_TOKEN`. It relies on GitHub OIDC with `id-token: write`, Node 24, and npm 11.5.2 or newer so npm can publish through trusted publishing with provenance.

Install the `pkg.pr.new` GitHub app on `storybookjs/vitest-plugin-rsc` before relying on preview packages. Preview packages are not npm `latest` releases and should be used only for testing unreleased commits.

## Alpha Releases

`vitest-plugin-rsc` releases alphas: `release-please-config.json` gives it the `prerelease` versioning with the type `alpha.0`. From 0.3.0, a breaking change makes the release PR `0.4.0-alpha.0`, and every release after it counts up, `0.4.0-alpha.1`, `0.4.0-alpha.2`, whatever its commits are. Each one is a GitHub pre-release, and the workflow publishes it with the dist-tag `alpha`: `npm install vitest-plugin-rsc@alpha` installs it, and `latest` stays at the last release that is no alpha.

To leave the alphas, set `"prerelease": false`: the next release PR is then the version without its suffix, like `0.4.0`, and goes to `latest`.

## Two Packages

The repository has two packages, and Release Please releases each on its own, from the commits that change files in its directory:

- `vitest-plugin-rsc`, in `packages/vitest-plugin-rsc`: tags `v<version>`, published to npm by the release workflow.
- `@storybook/nextjs-vite-rsc`, in `packages/storybook-nextjs-vite-rsc`: tags `storybook-nextjs-vite-rsc-v<version>`, GitHub releases marked as pre-releases. Not published to npm yet: the release workflow has no publish job for it.

Each package has a release PR of its own (`separate-pull-requests`). Until the first release of `@storybook/nextjs-vite-rsc`, Release Please logs "Expected 2 releases, only found 1" and reads the commits back to `bootstrap-sha`; that is expected.

The preview workflow publishes both packages in one `pkg-pr-new` run, with `--no-compact`: on npm, `@storybook/nextjs-vite-rsc` belongs to storybookjs/storybook so far, and a compact URL resolves through the `repository` of the npm package.

A publish job for `@storybook/nextjs-vite-rsc` has to pack with pnpm (`pnpm publish --provenance`, or `pnpm pack` and `npm publish <tarball>`): pnpm turns its `workspace:^` peer dependency on `vitest-plugin-rsc` into a version range, npm does not.
