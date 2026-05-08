# Releasing

This repository has two release paths:

- Official npm releases use Release Please. Commits merged to `main` with Conventional Commit titles are collected into a release PR. When that release PR is merged, GitHub creates the release and the workflow publishes `vitest-plugin-rsc` to npm with the `latest` dist-tag.
- Preview packages use `pkg.pr.new`. Every `pull_request` update and every `main` push runs the preview workflow and publishes installable package URLs outside the npm registry.

## Required Setup

Configure npm trusted publishing for `vitest-plugin-rsc` before merging the first Release Please PR:

- npm package: `vitest-plugin-rsc`
- GitHub repository: `storybookjs/vitest-plugin-rsc`
- Workflow filename: `release-please.yml`
- Environment: `Release`

The release workflow intentionally does not use `NODE_AUTH_TOKEN`. It relies on GitHub OIDC with `id-token: write`, Node 24, and npm 11.5.2 or newer so npm can publish through trusted publishing with provenance.

Install the `pkg.pr.new` GitHub app on `storybookjs/vitest-plugin-rsc` before relying on preview packages. Preview packages are not npm `latest` releases and should be used only for testing unreleased commits.
