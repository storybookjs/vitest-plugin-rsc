# Changelog

## [0.2.1](https://github.com/storybookjs/vitest-plugin-rsc/compare/v0.2.0...v0.2.1) (2026-05-14)


### Features

* add React client coverage bridge ([2bac6c1](https://github.com/storybookjs/vitest-plugin-rsc/commit/2bac6c19b3f98451b869feeb02423e0fcb0c223c))


### Bug Fixes

* align Next testing transport with App Router protocol ([6d7384c](https://github.com/storybookjs/vitest-plugin-rsc/commit/6d7384c9e35de3f8975c15bd30bf761aa7246f95))
* avoid patched fetch when recording coverage ([798aa6d](https://github.com/storybookjs/vitest-plugin-rsc/commit/798aa6dc0ffc5f864293ca5d3049c68e324c5993))
* harden Next.js compatibility coverage ([f055c40](https://github.com/storybookjs/vitest-plugin-rsc/commit/f055c4087d9368e0b0e2fb9b8a8af62b6944ba8b))
* prebundle Next testing dependencies ([1d2b7d0](https://github.com/storybookjs/vitest-plugin-rsc/commit/1d2b7d051593792b1a337b580f90512894c65b85))
* satisfy cleanup lint rule ([a9dec7f](https://github.com/storybookjs/vitest-plugin-rsc/commit/a9dec7f59301528c2d923cd356304aaaa37ddb24))

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
