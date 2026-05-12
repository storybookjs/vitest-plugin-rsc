# Changelog

## [0.2.0](https://github.com/storybookjs/vitest-plugin-rsc/compare/v0.1.2...v0.2.0) (2026-05-12)


### ⚠ BREAKING CHANGES

* removes the legacy vitest-plugin-rsc/nextjs/cache, vitest-plugin-rsc/nextjs/headers, and vitest-plugin-rsc/nextjs/navigation shim subpaths. Import the corresponding public Next.js modules directly.

### Features

* support Next request runtime transport ([e8bd31f](https://github.com/storybookjs/vitest-plugin-rsc/commit/e8bd31f22a5b53bfd0f26604a13aa1a9e9bc9c29))

## [0.1.2](https://github.com/storybookjs/vitest-plugin-rsc/compare/v0.1.1...v0.1.2) (2026-05-12)

### Features

- add React client coverage support ([df198d9](https://github.com/storybookjs/vitest-plugin-rsc/commit/df198d91d2bc202afb3d84ac7e2124d00aece9d2))
- support Next async context in browser tests ([a9913e5](https://github.com/storybookjs/vitest-plugin-rsc/commit/a9913e5bb8f94adc5293478e1ba05d5e1d8ed4d9))

### Bug Fixes

- stabilize async context tests ([86b00e6](https://github.com/storybookjs/vitest-plugin-rsc/commit/86b00e6b6a7c49bd55a550ae6ae656ced4187d6a))

## [0.1.1](https://github.com/storybookjs/vitest-plugin-rsc/compare/v0.1.0...v0.1.1) (2026-05-08)

### Features

- update notes demo app ([227872d](https://github.com/storybookjs/vitest-plugin-rsc/commit/227872de9e69467123d01100c4975e74491cc697))

### Bug Fixes

- avoid eager client pre-transform ([154356e](https://github.com/storybookjs/vitest-plugin-rsc/commit/154356ec9ff0f3d0d3089df59d7b7ef0ea2ea882))
- refresh NextRouter state after server actions ([1e6b607](https://github.com/storybookjs/vitest-plugin-rsc/commit/1e6b607b295bf6a5f682ae49e2897730cb3b7a09))

## 0.1.0 (2026-05-08)

### Features

- add Next 16 websocket client runner ([#15](https://github.com/storybookjs/vitest-plugin-rsc/issues/15)) ([d5d2c73](https://github.com/storybookjs/vitest-plugin-rsc/commit/d5d2c73d86148c00fa4ca4ec12fe5e2f3fcdcd70))
