# Changelog

## [0.4.0-alpha.1](https://github.com/storybookjs/vitest-plugin-rsc/compare/v0.4.0-alpha.0...v0.4.0-alpha.1) (2026-10-22)


### ⚠ BREAKING CHANGES

* `vitestPluginNext()` has to come after `vitestPluginRSC()` in the plugins. It throws otherwise.

### Bug Fixes

* a change of the plugin's resolution or compile of a dependency renews the optimizer's cache ([#236](https://github.com/storybookjs/vitest-plugin-rsc/issues/236)) ([c82ca41](https://github.com/storybookjs/vitest-plugin-rsc/commit/c82ca41fdfc400133878cc0813867df9c70c8b42))
* a page that is left runs none of its timers ([#232](https://github.com/storybookjs/vitest-plugin-rsc/issues/232)) ([4089863](https://github.com/storybookjs/vitest-plugin-rsc/commit/4089863162285d1d8ea5eaa2c46d33f70aa3202b))
* a plugin of the test project sees a test file with "use client" as written ([#231](https://github.com/storybookjs/vitest-plugin-rsc/issues/231)) ([631ce28](https://github.com/storybookjs/vitest-plugin-rsc/commit/631ce28cf7eb62f4dba29d60887456ed06d2480b))
* revalidation and navigation of a prerendered route, after [#235](https://github.com/storybookjs/vitest-plugin-rsc/issues/235) ([#242](https://github.com/storybookjs/vitest-plugin-rsc/issues/242)) ([13d7aa0](https://github.com/storybookjs/vitest-plugin-rsc/commit/13d7aa0942d52408db30260bc0fb065b0e469431))
* the optimizer of a server layer finds its dependencies in its scan ([#241](https://github.com/storybookjs/vitest-plugin-rsc/issues/241)) ([23666ba](https://github.com/storybookjs/vitest-plugin-rsc/commit/23666ba346eab31f0a39306bc402cc5a16c25aac))

## [0.4.0-alpha.0](https://github.com/storybookjs/vitest-plugin-rsc/compare/v0.3.0...v0.4.0-alpha.0) (2026-10-22)


### ⚠ BREAKING CHANGES

* keep what `next build` prerenders, with `build: "production"` ([#230](https://github.com/storybookjs/vitest-plugin-rsc/issues/230)) (#235)
* Vitest 5.0.4 is the new minimum.
* the `affectedTests` option of `vitestPluginNext()` is gone. Watch mode reruns every test file that opens a route on an edit of the app, and `vitest --changed` and `vitest related` use Vitest's own import graph.
* every async function in the app's source files of the rsc layer is compiled. A helper of `unstable_cache` that reads `cookies()` after an `await` now throws, as in a deployment.
* a "use client" test file and a host's Client Components outside a context have the browser's own `fetch` (to the network, not the app's route handlers), cookies and storage (not emptied between tests). `cleanup()` ends with the browser's own APIs: seed after `newBrowserContext()` or in a `beforeEach()`, not at a file's top level, in `beforeAll()` or in a loader. A spy on `fetch` set before a context opens sees only requests that are not the app's.
* a host that imports only vitest-plugin-rsc/nextjs/client-components now gets the page's storage instead of the browser's.
* a NEXT_PUBLIC_* value of the host's process (shell, .env.local, .env.development) no longer reaches dependencies as a define; the page reads these names from the env files only.
* a host whose host.files match its own page entry loses the CSS that entry imports; such CSS moves to the browserModules or to a package of the host. next-files.json no longer has clientFiles.
* `loadClientModule` and `linkStylesheetsOf` moved from `vitest-plugin-rsc/nextjs/testing-library` to `vitest-plugin-rsc/nextjs/client-components`.
* a host links the CSS of its client files with linkStylesheetsOf(); a page no longer has the CSS of a test file or setup file.
* keepStorageKeys() is gone. A page's localStorage and sessionStorage are its own, so a host no longer has to name the keys it keeps.
* `files` of renderServer() is now `hostFiles`.
* The app's cookies are in a cookie jar of the plugin, one for each document, and no longer in the browser's own cookies. `document.cookie` is a view of that jar.
    - `document.cookie` hides `HttpOnly` cookies, and a test can't write or change one there. Read one with `response.headers.getSetCookie()`, or with `cookies()` in `runInServerAction()`, and set one with `cookies().set()` there.
    - The page has no `cookieStore`.
    - A `cookie` header of `renderServer()` goes with every request of the page, not with the document alone, until the test ends or the app changes it.
    - A `fetch` from client code no longer sees `Set-Cookie` headers.
    - A cookie's `Path` and `Domain` no longer limit which requests carry it.
    - The browser's own cookies don't reach the app, and `cleanup()` no longer deletes them.
    - `handleRequest()` with `credentials: "omit"` sends no cookies.

### Features

* `crypto` hashes with MD5, SHA-1 and SHA-2, and `zlib` compresses, in the server layers ([#219](https://github.com/storybookjs/vitest-plugin-rsc/issues/219)) ([ae54cfb](https://github.com/storybookjs/vitest-plugin-rsc/commit/ae54cfb6a480b6d0417b83b999da7b0dfd93be21))
* a browser context of the app; client stories have the browser's own APIs ([#214](https://github.com/storybookjs/vitest-plugin-rsc/issues/214)) ([9ae15d2](https://github.com/storybookjs/vitest-plugin-rsc/commit/9ae15d271205b14750648a509633b1cbd3659ec1))
* a change of what a "use client" host file imports changes its module in the rsc layer ([#150](https://github.com/storybookjs/vitest-plugin-rsc/issues/150)) ([f04403a](https://github.com/storybookjs/vitest-plugin-rsc/commit/f04403a2074aaa5906af1261c236f2d8b61e1db2))
* a client reference renders as its browser-layer export in the same document ([#145](https://github.com/storybookjs/vitest-plugin-rsc/issues/145)) ([474c446](https://github.com/storybookjs/vitest-plugin-rsc/commit/474c446f31fd38da6f0cd5665240e25cc25118a2))
* a disk in memory for the server's fs, and Node's other modules from unenv ([#187](https://github.com/storybookjs/vitest-plugin-rsc/issues/187)) ([8e5a779](https://github.com/storybookjs/vitest-plugin-rsc/commit/8e5a77976c4ca344a2aec2923ef89726db517649))
* a host loads client modules through an entry that starts no layer of Next's server ([#181](https://github.com/storybookjs/vitest-plugin-rsc/issues/181)) ([ad240f0](https://github.com/storybookjs/vitest-plugin-rsc/commit/ad240f01f79b002a80579f51ba8c466462d8a837))
* a navigation whose answer is a download is downloaded, and the page stays ([#210](https://github.com/storybookjs/vitest-plugin-rsc/issues/210)) ([eabc505](https://github.com/storybookjs/vitest-plugin-rsc/commit/eabc5050fe10bf41c78432068c48773649ed1131))
* a page's Web Storage is its own, as its cookies are ([#169](https://github.com/storybookjs/vitest-plugin-rsc/issues/169)) ([3e3e3bf](https://github.com/storybookjs/vitest-plugin-rsc/commit/3e3e3bf3c73e58e3fbb4930e791879532771f018))
* a static build links the CSS of the files of the host that render a node ([#111](https://github.com/storybookjs/vitest-plugin-rsc/issues/111)) ([88aed58](https://github.com/storybookjs/vitest-plugin-rsc/commit/88aed58e910baff30fa84b02710006c0afe6c516))
* add a build option to run the app as next start does ([#94](https://github.com/storybookjs/vitest-plugin-rsc/issues/94)) ([152ba41](https://github.com/storybookjs/vitest-plugin-rsc/commit/152ba41383d150de5db57734b868d86dc51d169e))
* add runInServerAction to run code inside a Server Action without a page ([#84](https://github.com/storybookjs/vitest-plugin-rsc/issues/84)) ([8bb82dc](https://github.com/storybookjs/vitest-plugin-rsc/commit/8bb82dcf3ce760d6275de5ccbe15a3f3da426d40))
* build Next's production code by default in a static build ([#108](https://github.com/storybookjs/vitest-plugin-rsc/issues/108)) ([f30de0c](https://github.com/storybookjs/vitest-plugin-rsc/commit/f30de0c878a0f61a70b6ca7a94953ebbf425beee))
* build the app's layers into a static site ([#104](https://github.com/storybookjs/vitest-plugin-rsc/issues/104)) ([caf70bc](https://github.com/storybookjs/vitest-plugin-rsc/commit/caf70bc9c05ad335216bc82b8d16465ee4233426))
* build vitestPluginRSC() on its own into a static site ([#113](https://github.com/storybookjs/vitest-plugin-rsc/issues/113)) ([a81830e](https://github.com/storybookjs/vitest-plugin-rsc/commit/a81830e30fec6d23b4500730d93a4ee94d447955))
* keep the app's cookies in a cookie jar of the plugin ([#100](https://github.com/storybookjs/vitest-plugin-rsc/issues/100)) ([cfde6df](https://github.com/storybookjs/vitest-plugin-rsc/commit/cfde6dfeb3085572b45626a1f07ef0f4e55c6d1f))
* keep what `next build` prerenders, with `build: "production"` ([#230](https://github.com/storybookjs/vitest-plugin-rsc/issues/230)) ([#235](https://github.com/storybookjs/vitest-plugin-rsc/issues/235)) ([4d43e6e](https://github.com/storybookjs/vitest-plugin-rsc/commit/4d43e6ea094ebe9ae1ed6b0cdd04da4d9d23ca5b))
* link the CSS of a route as Next does, compiled with Next's CSS rules ([#76](https://github.com/storybookjs/vitest-plugin-rsc/issues/76)) ([dadd59b](https://github.com/storybookjs/vitest-plugin-rsc/commit/dadd59b5b20c3a500e5b8343d89f492401211020))
* load "use client" files and packages of the host in a static build ([#123](https://github.com/storybookjs/vitest-plugin-rsc/issues/123)) ([58285ba](https://github.com/storybookjs/vitest-plugin-rsc/commit/58285ba7b2eeaa82f27c66f11088dc5655e0cfcf))
* load a compiled host file like .mdx, and walk the package of a host.packages subpath ([#126](https://github.com/storybookjs/vitest-plugin-rsc/issues/126)) ([5e582f7](https://github.com/storybookjs/vitest-plugin-rsc/commit/5e582f76114b48c7c03e2d6fcd666c2d6823b01e))
* loadClientModule identifies a client file by the plugin's own export, once per version ([#148](https://github.com/storybookjs/vitest-plugin-rsc/issues/148)) ([876022d](https://github.com/storybookjs/vitest-plugin-rsc/commit/876022d82169a15c649162fac7eb981bc1a849de))
* loadClientModule() gives a host the exports of a "use client" file ([#121](https://github.com/storybookjs/vitest-plugin-rsc/issues/121)) ([0c5b3f7](https://github.com/storybookjs/vitest-plugin-rsc/commit/0c5b3f7e7fb0f29bad89750249c56bacb350a9db))
* remove the affectedTests option; Vitest 5.0.5 ([#225](https://github.com/storybookjs/vitest-plugin-rsc/issues/225)) ([790899e](https://github.com/storybookjs/vitest-plugin-rsc/commit/790899e740509623e461356935e3df82d309ca2d))
* rename files of renderServer() to hostFiles, a host option ([#112](https://github.com/storybookjs/vitest-plugin-rsc/issues/112)) ([03d1ecd](https://github.com/storybookjs/vitest-plugin-rsc/commit/03d1ecdaedee598b8b0ff825af80eecb330363b1))
* renderServer() takes a signal and resolves with the page's errors, and cleanup() takes a URL ([#149](https://github.com/storybookjs/vitest-plugin-rsc/issues/149)) ([841b882](https://github.com/storybookjs/vitest-plugin-rsc/commit/841b882badcd971877dd598292bc65f647e37773))
* require Vitest 5.0.4, and a README with a quick start ([#226](https://github.com/storybookjs/vitest-plugin-rsc/issues/226)) ([28980df](https://github.com/storybookjs/vitest-plugin-rsc/commit/28980df1f6d293d9e1868468fc23353d346e5835))
* rerender a node without a page load ([#131](https://github.com/storybookjs/vitest-plugin-rsc/issues/131)) ([7277dd4](https://github.com/storybookjs/vitest-plugin-rsc/commit/7277dd45f86713eaf215a8210b51b7b9390f2ebf))
* run a test file with "use client" in the browser layer ([#99](https://github.com/storybookjs/vitest-plugin-rsc/issues/99)) ([41def92](https://github.com/storybookjs/vitest-plugin-rsc/commit/41def92d06f116b4d240589032813e9c2cb97d0c))
* server layers get every module of Node.js from the package, one ESM file each ([#201](https://github.com/storybookjs/vitest-plugin-rsc/issues/201)) ([6a99fc7](https://github.com/storybookjs/vitest-plugin-rsc/commit/6a99fc78072386974d793a6466bcf33dae350368))
* support "use cache" and Cache Components ([#221](https://github.com/storybookjs/vitest-plugin-rsc/issues/221)) ([74f7e23](https://github.com/storybookjs/vitest-plugin-rsc/commit/74f7e2308812d2378cb84c50031ac1dfc07495c6))
* the CSS of a host's client file is in the document while the host uses it, and a page has none of the host's ([#178](https://github.com/storybookjs/vitest-plugin-rsc/issues/178)) ([b291d9b](https://github.com/storybookjs/vitest-plugin-rsc/commit/b291d9bcc4d5e8b2480385e01b558561db9c5720))
* the host says which of its files render a node, with files of renderServer() ([#109](https://github.com/storybookjs/vitest-plugin-rsc/issues/109)) ([be68793](https://github.com/storybookjs/vitest-plugin-rsc/commit/be687933573765149681c4ae006873ac645f0be8))
* the page's process.env has the project's test env ([#206](https://github.com/storybookjs/vitest-plugin-rsc/issues/206)) ([a8e188d](https://github.com/storybookjs/vitest-plugin-rsc/commit/a8e188d2c6030eebc09f8b7ddb47fd0bd13b955a))
* the plugin knows no host by name and reads no private of React DOM or Rolldown's messages ([#151](https://github.com/storybookjs/vitest-plugin-rsc/issues/151)) ([163e0e3](https://github.com/storybookjs/vitest-plugin-rsc/commit/163e0e3e2a1bef09e9b3e9a33d85c79b56a8b353))
* wider Next.js conformance with "use cache", CSS, metadata files and production mode ([#228](https://github.com/storybookjs/vitest-plugin-rsc/issues/228)) ([a220fea](https://github.com/storybookjs/vitest-plugin-rsc/commit/a220fea7788ddde0e030ebb083e0f03d39725b84))


### Bug Fixes

* a change of a file that a stylesheet depends on loads no page again ([#177](https://github.com/storybookjs/vitest-plugin-rsc/issues/177)) ([4dd189a](https://github.com/storybookjs/vitest-plugin-rsc/commit/4dd189a72354ffbc7e02ed6a9f2a5b370fc718eb))
* a client story starts with the page's storage, empty ([#209](https://github.com/storybookjs/vitest-plugin-rsc/issues/209)) ([59a69b4](https://github.com/storybookjs/vitest-plugin-rsc/commit/59a69b495c08327f0f7e2051ea1a519f3218e5f6))
* a dev server scans the host's pages and the app, and pre-bundles once ([#171](https://github.com/storybookjs/vitest-plugin-rsc/issues/171)) ([f19f256](https://github.com/storybookjs/vitest-plugin-rsc/commit/f19f25627b31e2eb98a9e2984561bc0d43a8a43c))
* a file with "use client" is one evaluation for every reader, until it changes ([#173](https://github.com/storybookjs/vitest-plugin-rsc/issues/173)) ([dfa746b](https://github.com/storybookjs/vitest-plugin-rsc/commit/dfa746b15716b5dde3b09d22f488a688afc0e09c))
* a host file in node_modules with Vite's version query loads in the browser layer ([#118](https://github.com/storybookjs/vitest-plugin-rsc/issues/118)) ([07d0034](https://github.com/storybookjs/vitest-plugin-rsc/commit/07d0034663aba9fa13ff6b07e3be94cd8573087f))
* a layer pre-bundles a dependency only under the name it resolves it to ([#153](https://github.com/storybookjs/vitest-plugin-rsc/issues/153)) ([6f5906d](https://github.com/storybookjs/vitest-plugin-rsc/commit/6f5906d2db308d81df46b41e501be29187c2dd7d))
* a page shows once the stylesheets of its head have loaded ([#156](https://github.com/storybookjs/vitest-plugin-rsc/issues/156)) ([30f848c](https://github.com/storybookjs/vitest-plugin-rsc/commit/30f848cbf4d96feb7835e1c6b233de604ac94dbb))
* a page that is left keeps no module graph, and loads nothing more ([#170](https://github.com/storybookjs/vitest-plugin-rsc/issues/170)) ([4ddfbd4](https://github.com/storybookjs/vitest-plugin-rsc/commit/4ddfbd46e6b23795551bba92c1ab4bc15786fc29))
* a page that is left keeps no module loader or hydration callback of its own ([#197](https://github.com/storybookjs/vitest-plugin-rsc/issues/197)) ([48a3e86](https://github.com/storybookjs/vitest-plugin-rsc/commit/48a3e8662e9f9d2e67a4261a3791bc4b2e4b2c05))
* a page that was left hears no more of the requests Next sent for it ([#130](https://github.com/storybookjs/vitest-plugin-rsc/issues/130)) ([4ddfb6a](https://github.com/storybookjs/vitest-plugin-rsc/commit/4ddfb6a2371c1313d6536b689e7e41dfd57f3617))
* a static build reads data, not text, for directives and chunk imports ([#172](https://github.com/storybookjs/vitest-plugin-rsc/issues/172)) ([b82304a](https://github.com/storybookjs/vitest-plugin-rsc/commit/b82304a56b0610e2a065fd2c7d467cd2fc0d7b3e))
* a url() in the CSS of a layer names the file from the CSS's own directory ([#134](https://github.com/storybookjs/vitest-plugin-rsc/issues/134)) ([589844d](https://github.com/storybookjs/vitest-plugin-rsc/commit/589844dd52cbfca37fbef205deb70c463ad6f2e1))
* an edit of a stylesheet that a page links updates the page in place ([#182](https://github.com/storybookjs/vitest-plugin-rsc/issues/182)) ([dd2e9ff](https://github.com/storybookjs/vitest-plugin-rsc/commit/dd2e9ff430a0806bf852f6b9b660536552fbd504))
* forget what the app stored when its document goes without cleanup() ([#135](https://github.com/storybookjs/vitest-plugin-rsc/issues/135)) ([f6036c6](https://github.com/storybookjs/vitest-plugin-rsc/commit/f6036c6b371a68e33745cc35f0a00a984d1c3d8d))
* keep Next's client navigations working without its dev server ([#101](https://github.com/storybookjs/vitest-plugin-rsc/issues/101)) ([c3291d6](https://github.com/storybookjs/vitest-plugin-rsc/commit/c3291d64a2840d9396743a9157813ec57db00694))
* keep React's Flight server off the page's console ([cfde6df](https://github.com/storybookjs/vitest-plugin-rsc/commit/cfde6dfeb3085572b45626a1f07ef0f4e55c6d1f))
* keep the node of a page that is left while it loads until its request is done ([#116](https://github.com/storybookjs/vitest-plugin-rsc/issues/116)) ([8ec58b6](https://github.com/storybookjs/vitest-plugin-rsc/commit/8ec58b6fd9d26d9203dd99662e50665875d4fb18))
* keep the paths of the machine out of a static build ([#110](https://github.com/storybookjs/vitest-plugin-rsc/issues/110)) ([e1b0215](https://github.com/storybookjs/vitest-plugin-rsc/commit/e1b02157aabde075b31ff3ff000d23db05b59935))
* keep what another document of the origin stores in the browser ([#117](https://github.com/storybookjs/vitest-plugin-rsc/issues/117)) ([f07a546](https://github.com/storybookjs/vitest-plugin-rsc/commit/f07a5460e33d913f7c576cbb47d48f54415d5e1f))
* key Next's client references by one specifier in a build ([#115](https://github.com/storybookjs/vitest-plugin-rsc/issues/115)) ([7f4eefe](https://github.com/storybookjs/vitest-plugin-rsc/commit/7f4eefe6f366b88ef92edda51739963438636b81))
* leave a page and its requests before the next test starts ([#83](https://github.com/storybookjs/vitest-plugin-rsc/issues/83)) ([595c63e](https://github.com/storybookjs/vitest-plugin-rsc/commit/595c63e199956d0f60b50bb03d1f8d338936081a))
* leave the page when the connection to the dev server is lost ([#167](https://github.com/storybookjs/vitest-plugin-rsc/issues/167)) ([73ecc0b](https://github.com/storybookjs/vitest-plugin-rsc/commit/73ecc0b5b0605d1512697752d71a64598ec74a78))
* link the CSS of a Client Component in node_modules with a version query ([#124](https://github.com/storybookjs/vitest-plugin-rsc/issues/124)) ([b793f22](https://github.com/storybookjs/vitest-plugin-rsc/commit/b793f22545c383619068a2f5d15adb3faef44739))
* linkStylesheetsOf() ends as its signal aborts, also while it asks for the stylesheets ([#193](https://github.com/storybookjs/vitest-plugin-rsc/issues/193)) ([37ac5f3](https://github.com/storybookjs/vitest-plugin-rsc/commit/37ac5f3a57b0c0bf3777d26e8a7455da96c41dcd))
* load a file with "use client" that the host imports before the plugin ([#137](https://github.com/storybookjs/vitest-plugin-rsc/issues/137)) ([04be8eb](https://github.com/storybookjs/vitest-plugin-rsc/commit/04be8eb2f14fba6cc93fafd7abdc23f2fc6a9ac4))
* load the host's document again after a change of the app, with its page left first ([#128](https://github.com/storybookjs/vitest-plugin-rsc/issues/128)) ([d67fef1](https://github.com/storybookjs/vitest-plugin-rsc/commit/d67fef18b950ab368d78225325dea84b3eb84908))
* load the host's document at a navigation to the node's URL ([#144](https://github.com/storybookjs/vitest-plugin-rsc/issues/144)) ([8310d8a](https://github.com/storybookjs/vitest-plugin-rsc/commit/8310d8a176948d41b5140b29866dcc04a6088e8b))
* Prisma's client loads in the server layers, and a server's request sends its body ([#199](https://github.com/storybookjs/vitest-plugin-rsc/issues/199)) ([dab1adf](https://github.com/storybookjs/vitest-plugin-rsc/commit/dab1adf0953989c3cf0804772899c3bda5330ed2))
* put back the host's URL as each page opened ([#125](https://github.com/storybookjs/vitest-plugin-rsc/issues/125)) ([618ae89](https://github.com/storybookjs/vitest-plugin-rsc/commit/618ae8906ffa228fea956c8fdcd1cbacf17e0cef))
* release a page's React DOM properties on the document when it is left ([#140](https://github.com/storybookjs/vitest-plugin-rsc/issues/140)) ([e589ebf](https://github.com/storybookjs/vitest-plugin-rsc/commit/e589ebf222c223b91873b862ea8e47bb8cbe9488))
* reload the host's document at a reload while a node is open ([#141](https://github.com/storybookjs/vitest-plugin-rsc/issues/141)) ([092a40d](https://github.com/storybookjs/vitest-plugin-rsc/commit/092a40d53bccbf7a85fe1b1981e74e2b79302e08))
* render no page after a redirect() in runInServerAction ([#102](https://github.com/storybookjs/vitest-plugin-rsc/issues/102)) ([cc07ec7](https://github.com/storybookjs/vitest-plugin-rsc/commit/cc07ec78defbca4314c643de53e2672e8b38cb5f))
* resolve a bare import of Next to its file in a build ([#127](https://github.com/storybookjs/vitest-plugin-rsc/issues/127)) ([433a1de](https://github.com/storybookjs/vitest-plugin-rsc/commit/433a1dec9a891976ac20c2f7c8eaf693341b3f75))
* resolve relative URLs against the page's URL on load, and the runner's on leave ([#133](https://github.com/storybookjs/vitest-plugin-rsc/issues/133)) ([bf10b5b](https://github.com/storybookjs/vitest-plugin-rsc/commit/bf10b5b93bf673612e9bc4d7e58b32a61ced3ab9))
* send the headers of renderServer with every request of the page ([8b4cbde](https://github.com/storybookjs/vitest-plugin-rsc/commit/8b4cbded7ca99966811deaddd19458fba289a920))
* the CSS of a host's file goes with its uses, in either layer ([#190](https://github.com/storybookjs/vitest-plugin-rsc/issues/190)) ([ea18952](https://github.com/storybookjs/vitest-plugin-rsc/commit/ea189526ac2c440cbe969b44bf3bd1ba5d099250))
* the server keeps no response once Next's handler is done with it ([#198](https://github.com/storybookjs/vitest-plugin-rsc/issues/198)) ([93757ee](https://github.com/storybookjs/vitest-plugin-rsc/commit/93757eea14de20736ebe74307830e4a6edb9fdc9))
* the server listens for a request's abort only while it answers it ([#202](https://github.com/storybookjs/vitest-plugin-rsc/issues/202)) ([df3f276](https://github.com/storybookjs/vitest-plugin-rsc/commit/df3f27649b716a04608837f648ee8717cf0f5760))
* the static build lists every module of the page that the browser scan's graph reaches ([#155](https://github.com/storybookjs/vitest-plugin-rsc/issues/155)) ([0d39c30](https://github.com/storybookjs/vitest-plugin-rsc/commit/0d39c30670f03602fa4524ccf98589b76645cbf7))
* wait for the requests the server is still handling when a page is left ([#85](https://github.com/storybookjs/vitest-plugin-rsc/issues/85)) ([d7144bb](https://github.com/storybookjs/vitest-plugin-rsc/commit/d7144bb8bf33becca03a2edd3b8998c3ecbc4528))


### Performance Improvements

* a built page starts the browser layer from its HTML, and the ssr layer after it ([#168](https://github.com/storybookjs/vitest-plugin-rsc/issues/168)) ([5c0daba](https://github.com/storybookjs/vitest-plugin-rsc/commit/5c0daba7975d4d64f54eb56bbb944d9ddb6fdc11))
* a page starts the stylesheets and modules of its route at once ([#164](https://github.com/storybookjs/vitest-plugin-rsc/issues/164)) ([1e7cd2b](https://github.com/storybookjs/vitest-plugin-rsc/commit/1e7cd2bf8d3a19c47ff140c81d31d40473bcfeb9))
* ask for a route's stylesheets over the page's websocket ([#122](https://github.com/storybookjs/vitest-plugin-rsc/issues/122)) ([b491f0c](https://github.com/storybookjs/vitest-plugin-rsc/commit/b491f0ca1ba9468c63cef32a7b705a27c61a7790))
* compile pre-bundled dependencies with Rolldown's module runner transform ([#89](https://github.com/storybookjs/vitest-plugin-rsc/issues/89)) ([ad26c10](https://github.com/storybookjs/vitest-plugin-rsc/commit/ad26c1058393beadc5ddbe46d2ef347ace874b8b))
* fetch and compile the modules of a page load once ([#86](https://github.com/storybookjs/vitest-plugin-rsc/issues/86)) ([8f446d1](https://github.com/storybookjs/vitest-plugin-rsc/commit/8f446d168797ea6048cf041ff7bb0bd16fc06275))
* fetch the modules of a page at once, and dependencies without source maps ([#88](https://github.com/storybookjs/vitest-plugin-rsc/issues/88)) ([cf6540f](https://github.com/storybookjs/vitest-plugin-rsc/commit/cf6540f4b6ee9d908a9ad4d29082f9db575c0150))
* leave files that are no code out of the walk for a route's stylesheets ([#93](https://github.com/storybookjs/vitest-plugin-rsc/issues/93)) ([10ebe1d](https://github.com/storybookjs/vitest-plugin-rsc/commit/10ebe1d85b6d757deb4e326ab17beee5b643d977))
* let the browser keep the stylesheets that Next links ([#95](https://github.com/storybookjs/vitest-plugin-rsc/issues/95)) ([9833335](https://github.com/storybookjs/vitest-plugin-rsc/commit/9833335152d68e31e0b5942ed2e49b8aa5ac3d36))
* the server in front of the app routes without the ssr layer ([#159](https://github.com/storybookjs/vitest-plugin-rsc/issues/159)) ([d4e3426](https://github.com/storybookjs/vitest-plugin-rsc/commit/d4e3426391ee1c4d8eb3b440ed4c9e7fbcd04d13))
* the ssr layer lists the client references that server code reaches ([#179](https://github.com/storybookjs/vitest-plugin-rsc/issues/179)) ([0d22064](https://github.com/storybookjs/vitest-plugin-rsc/commit/0d220644d2fa42a5998dec910fa6621961f94a86))


### Reverts

* client stories keep the browser's own storage (reverts [#209](https://github.com/storybookjs/vitest-plugin-rsc/issues/209)) ([#212](https://github.com/storybookjs/vitest-plugin-rsc/issues/212)) ([a717ce3](https://github.com/storybookjs/vitest-plugin-rsc/commit/a717ce383bcd043bbeb299be58d8f8379a307d62))
* render a client reference with the browser layer's React ([#147](https://github.com/storybookjs/vitest-plugin-rsc/issues/147)) ([83b3dc4](https://github.com/storybookjs/vitest-plugin-rsc/commit/83b3dc4c1bbfb187b9570979c77245056f8de390))

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
