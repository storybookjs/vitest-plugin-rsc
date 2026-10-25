# Changelog

## 0.1.0 (2026-10-25)


### ⚠ BREAKING CHANGES

* a "use client" test file and a host's Client Components outside a context have the browser's own `fetch` (to the network, not the app's route handlers), cookies and storage (not emptied between tests). `cleanup()` ends with the browser's own APIs: seed after `newBrowserContext()` or in a `beforeEach()`, not at a file's top level, in `beforeAll()` or in a loader. A spy on `fetch` set before a context opens sees only requests that are not the app's.
* a host that imports only vitest-plugin-rsc/nextjs/client-components now gets the page's storage instead of the browser's.
* a NEXT_PUBLIC_* value of the host's process (shell, .env.local, .env.development) no longer reaches dependencies as a define; the page reads these names from the env files only.
* `loadClientModule` and `linkStylesheetsOf` moved from `vitest-plugin-rsc/nextjs/testing-library` to `vitest-plugin-rsc/nextjs/client-components`.
* a host links the CSS of its client files with linkStylesheetsOf(); a page no longer has the CSS of a test file or setup file.
* rewrite the Storybook framework on the Vitest model: two previews, CSF Next, a story that owns the document ([#157](https://github.com/storybookjs/vitest-plugin-rsc/issues/157))

### Features

* a browser context of the app; client stories have the browser's own APIs ([#214](https://github.com/storybookjs/vitest-plugin-rsc/issues/214)) ([9ae15d2](https://github.com/storybookjs/vitest-plugin-rsc/commit/9ae15d271205b14750648a509633b1cbd3659ec1))
* a host loads client modules through an entry that starts no layer of Next's server ([#181](https://github.com/storybookjs/vitest-plugin-rsc/issues/181)) ([ad240f0](https://github.com/storybookjs/vitest-plugin-rsc/commit/ad240f01f79b002a80579f51ba8c466462d8a837))
* **framework:** Storybook's Vitest addon runs the stories, and a test can run a story ([#233](https://github.com/storybookjs/vitest-plugin-rsc/issues/233)) ([8a9c0a5](https://github.com/storybookjs/vitest-plugin-rsc/commit/8a9c0a5b737c0ba0bee2372fc7ae98c395eb0f70))
* render docs pages and MDX in @storybook/nextjs-vite-rsc ([#138](https://github.com/storybookjs/vitest-plugin-rsc/issues/138)) ([e85d1c8](https://github.com/storybookjs/vitest-plugin-rsc/commit/e85d1c84affa9ef79775f736ae21f2de0f687523))
* render server stories, client stories and pages of a Next.js app in Storybook ([#129](https://github.com/storybookjs/vitest-plugin-rsc/issues/129)) ([a911962](https://github.com/storybookjs/vitest-plugin-rsc/commit/a9119620e115d0c4120858a33a195f5193c31783))
* rewrite the Storybook framework on the Vitest model: two previews, CSF Next, a story that owns the document ([#157](https://github.com/storybookjs/vitest-plugin-rsc/issues/157)) ([06cb46f](https://github.com/storybookjs/vitest-plugin-rsc/commit/06cb46fe8f83294d85ce2b43703c1c30554b663c))
* the CSS of a host's client file is in the document while the host uses it, and a page has none of the host's ([#178](https://github.com/storybookjs/vitest-plugin-rsc/issues/178)) ([b291d9b](https://github.com/storybookjs/vitest-plugin-rsc/commit/b291d9bcc4d5e8b2480385e01b558561db9c5720))
* the page's process.env has the project's test env ([#206](https://github.com/storybookjs/vitest-plugin-rsc/issues/206)) ([a8e188d](https://github.com/storybookjs/vitest-plugin-rsc/commit/a8e188d2c6030eebc09f8b7ddb47fd0bd13b955a))


### Bug Fixes

* a client story starts with the page's storage, empty ([#209](https://github.com/storybookjs/vitest-plugin-rsc/issues/209)) ([59a69b4](https://github.com/storybookjs/vitest-plugin-rsc/commit/59a69b495c08327f0f7e2051ea1a519f3218e5f6))
* a page story declares that it owns the document, on the canary with the WebView and dropped-render fixes ([#146](https://github.com/storybookjs/vitest-plugin-rsc/issues/146)) ([8bfd65a](https://github.com/storybookjs/vitest-plugin-rsc/commit/8bfd65a797b92248cd62ecc185fec07fcd04ed1c))
* a page that is left runs none of its timers ([#232](https://github.com/storybookjs/vitest-plugin-rsc/issues/232)) ([4089863](https://github.com/storybookjs/vitest-plugin-rsc/commit/4089863162285d1d8ea5eaa2c46d33f70aa3202b))
* the body of a story that owns the document is its root ([#154](https://github.com/storybookjs/vitest-plugin-rsc/issues/154)) ([0d179a6](https://github.com/storybookjs/vitest-plugin-rsc/commit/0d179a68697527fc657ef6e8af4957634fccc632))


### Reverts

* client stories keep the browser's own storage (reverts [#209](https://github.com/storybookjs/vitest-plugin-rsc/issues/209)) ([#212](https://github.com/storybookjs/vitest-plugin-rsc/issues/212)) ([a717ce3](https://github.com/storybookjs/vitest-plugin-rsc/commit/a717ce383bcd043bbeb299be58d8f8379a307d62))
