# Changelog

## [0.3.1](https://github.com/storybookjs/vitest-plugin-rsc/compare/v0.3.0...v0.3.1) (2026-10-09)


### Features

* add a build option to run the app as next start does ([#94](https://github.com/storybookjs/vitest-plugin-rsc/issues/94)) ([152ba41](https://github.com/storybookjs/vitest-plugin-rsc/commit/152ba41383d150de5db57734b868d86dc51d169e))
* add runInServerAction to run code inside a Server Action without a page ([#84](https://github.com/storybookjs/vitest-plugin-rsc/issues/84)) ([8bb82dc](https://github.com/storybookjs/vitest-plugin-rsc/commit/8bb82dcf3ce760d6275de5ccbe15a3f3da426d40))
* link the CSS of a route as Next does, compiled with Next's CSS rules ([#76](https://github.com/storybookjs/vitest-plugin-rsc/issues/76)) ([dadd59b](https://github.com/storybookjs/vitest-plugin-rsc/commit/dadd59b5b20c3a500e5b8343d89f492401211020))


### Bug Fixes

* leave a page and its requests before the next test starts ([#83](https://github.com/storybookjs/vitest-plugin-rsc/issues/83)) ([595c63e](https://github.com/storybookjs/vitest-plugin-rsc/commit/595c63e199956d0f60b50bb03d1f8d338936081a))
* send the headers of renderServer with every request of the page ([8b4cbde](https://github.com/storybookjs/vitest-plugin-rsc/commit/8b4cbded7ca99966811deaddd19458fba289a920))
* wait for the requests the server is still handling when a page is left ([#85](https://github.com/storybookjs/vitest-plugin-rsc/issues/85)) ([d7144bb](https://github.com/storybookjs/vitest-plugin-rsc/commit/d7144bb8bf33becca03a2edd3b8998c3ecbc4528))


### Performance Improvements

* compile pre-bundled dependencies with Rolldown's module runner transform ([#89](https://github.com/storybookjs/vitest-plugin-rsc/issues/89)) ([ad26c10](https://github.com/storybookjs/vitest-plugin-rsc/commit/ad26c1058393beadc5ddbe46d2ef347ace874b8b))
* fetch and compile the modules of a page load once ([#86](https://github.com/storybookjs/vitest-plugin-rsc/issues/86)) ([8f446d1](https://github.com/storybookjs/vitest-plugin-rsc/commit/8f446d168797ea6048cf041ff7bb0bd16fc06275))
* fetch the modules of a page at once, and dependencies without source maps ([#88](https://github.com/storybookjs/vitest-plugin-rsc/issues/88)) ([cf6540f](https://github.com/storybookjs/vitest-plugin-rsc/commit/cf6540f4b6ee9d908a9ad4d29082f9db575c0150))
* leave files that are no code out of the walk for a route's stylesheets ([#93](https://github.com/storybookjs/vitest-plugin-rsc/issues/93)) ([10ebe1d](https://github.com/storybookjs/vitest-plugin-rsc/commit/10ebe1d85b6d757deb4e326ab17beee5b643d977))

## [0.3.0](https://github.com/storybookjs/vitest-plugin-rsc/compare/v0.2.5...v0.3.0) (2026-10-08)


### ⚠ BREAKING CHANGES

* Next.js support now runs Next's own server and router in the browser, next to your test, so a few things change when you upgrade from 0.2.5:
    * **Requirements**: Next.js 16.4 or later, with `@next/routing` installed at the same version as `next`. Vitest 5.0.3 and Vite 8 are the new minimums.
    * **Setup**: remove `initialize()` and your own `afterEach(cleanup)` for the Next.js helpers. `vitestPluginNext()` adds a setup file that calls `cleanup()` before and after every test.
    * **MSW**: remove `nextRscRequestHandlers` (`vitest-plugin-rsc/nextjs/msw`) and `nextRscRequestsViaMsw`. Server Actions go straight to Next's server. MSW still works for your app's own outbound requests.
    * **`route`**: `renderServer(<Page />, { url, route })` no longer takes `route`. The plugin knows your app's routes, so the `url` is enough to get `params`.
    * **Navigation**: `expectToHaveBeenNavigatedTo()` is gone. A navigation opens the real page of your app now, so assert on what's on screen or on `window.location`.
    * **`rerender`**: gone from the result. Call `renderServer` again instead.
    * **`screen`**: an open page has its own `<body>`, so Testing Library's `screen` doesn't see it. Use `page` from `vitest/browser`, or `within(document.body)`.
    * **Imports**: `vitest-plugin-rsc/nextjs/testing-library` exports `renderServer`, `handleRequest` and `cleanup`. The old internal entry points (`./async-local-storage`, `./nextjs/os-browser`, `./nextjs/request-context`, `./nextjs/testing-library-client` and `./*`) are no longer exported, and `node:os` is no longer shimmed: add `vite-plugin-node-polyfills` if your server code imports it.

### Features

* add proxy and layouts flags to renderServer ([#75](https://github.com/storybookjs/vitest-plugin-rsc/issues/75)) ([e0c60b9](https://github.com/storybookjs/vitest-plugin-rsc/commit/e0c60b9313562a413c70684a3dcf6bf7d6f06efd))
* run Next.js App Router apps in Vitest Browser Mode ([#57](https://github.com/storybookjs/vitest-plugin-rsc/issues/57)) ([7b8d249](https://github.com/storybookjs/vitest-plugin-rsc/commit/7b8d2495db4bbaa3ada631d15fc5f51fc5565526))


### Bug Fixes

* send requests the way fetch does ([#77](https://github.com/storybookjs/vitest-plugin-rsc/issues/77)) ([ad046c3](https://github.com/storybookjs/vitest-plugin-rsc/commit/ad046c31e6eb1f33f5d01504cb82162465a941cc))
* three conformance bugs of the Next.js server ([#73](https://github.com/storybookjs/vitest-plugin-rsc/issues/73)) ([a401ed9](https://github.com/storybookjs/vitest-plugin-rsc/commit/a401ed93058753d2c8f51a8b41d50fa96f8a53f4))

## [0.2.5](https://github.com/storybookjs/vitest-plugin-rsc/compare/v0.2.4...v0.2.5) (2026-09-28)


### Bug Fixes

* capture react_client optimizeDeps after normal configEnvironment hooks ([e1a430b](https://github.com/storybookjs/vitest-plugin-rsc/commit/e1a430bfc4cc706af760034eef1117f9ea6265db))
* copy client optimizer entries to react_client in configureServer ([89e72ce](https://github.com/storybookjs/vitest-plugin-rsc/commit/89e72ce6d4f3254ce22c0edc06fd6e865cfbf8cc))
* drop unused @vitest/expect and loosen runtime dependency ranges ([d41ed21](https://github.com/storybookjs/vitest-plugin-rsc/commit/d41ed213e01f1a2815292ce42cc4474446b343a2))
* keep @vitejs/plugin-rsc on 0.5.26 ([231806d](https://github.com/storybookjs/vitest-plugin-rsc/commit/231806d9b2ce69ab4888578a004ebabe1e2c6848))
* keep react_client pre-bundling on Vitest 5's shared browser server ([9785d49](https://github.com/storybookjs/vitest-plugin-rsc/commit/9785d49ae6d3e92d3912e0371e0cdfac56677d36))
* support Next 16.4 canary RSC payloads and IncrementalCache options ([411f5b7](https://github.com/storybookjs/vitest-plugin-rsc/commit/411f5b70b22e97393f0c5ea10bfe52d2878fc307))
* support Next 16.4 canary RSC payloads and IncrementalCache options ([81b4874](https://github.com/storybookjs/vitest-plugin-rsc/commit/81b4874d83dc2e7b81615d8759782c95a2d2d1af))
* support Vitest 5.0.2 shared browser server; upgrade to Vite 8.3.1 and Vitest 5.0.2 ([32573c9](https://github.com/storybookjs/vitest-plugin-rsc/commit/32573c97f5a24d46ce58939f965fd2c43ae82c71))

## [0.2.4](https://github.com/storybookjs/vitest-plugin-rsc/compare/v0.2.3...v0.2.4) (2026-09-20)


### Bug Fixes

* support Next 16.3.x loader-tree signature ([46224d3](https://github.com/storybookjs/vitest-plugin-rsc/commit/46224d3def0f24205a495dd5baeee4f816376de0))
* support Next 16.3.x loader-tree signature ([f7e5579](https://github.com/storybookjs/vitest-plugin-rsc/commit/f7e5579d7dcc2b2e31a429a7f2894ec18916ec04))
* support Next 16.4 canary's transport-tree loader-tree API ([5d84a21](https://github.com/storybookjs/vitest-plugin-rsc/commit/5d84a2135bd79906974be25646c3e53570ad7342))

## [0.2.3](https://github.com/storybookjs/vitest-plugin-rsc/compare/v0.2.2...v0.2.3) (2026-05-16)


### Bug Fixes

* keep Vitest projects local ([#46](https://github.com/storybookjs/vitest-plugin-rsc/issues/46)) ([f90ed3e](https://github.com/storybookjs/vitest-plugin-rsc/commit/f90ed3eb974d406bf128fefc5196ddcfb904c6ba))
* match Vite browser port probing ([#49](https://github.com/storybookjs/vitest-plugin-rsc/issues/49)) ([66218b4](https://github.com/storybookjs/vitest-plugin-rsc/commit/66218b43788658440af0df5579f843e260c4b67b))

## [0.2.2](https://github.com/storybookjs/vitest-plugin-rsc/compare/v0.2.1...v0.2.2) (2026-05-15)


### Bug Fixes

* harden browser api port probing ([cd19924](https://github.com/storybookjs/vitest-plugin-rsc/commit/cd19924f9214799fc7112fa2d15f0d55ef3cc658))
* stabilize Vitest browser websocket fallback ([92b7ea9](https://github.com/storybookjs/vitest-plugin-rsc/commit/92b7ea94d5f43fb5cab7485222b837b2af366d9d))

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
