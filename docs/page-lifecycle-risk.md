# Page Lifecycle: Risk, Measurements, Recommendation

Every `renderServer()` is a page load of the app in the test's own document, and leaving a page is the plugin's work, not the browser's. A review of the project named that as a major risk: it might leak memory, and when it breaks the debugging surface is huge. This report measures how big that risk really is, compares it with the alternatives and their costs, and recommends a direction.

Measured at `4d43e6ea` on an Apple M1 Pro (32 GB), with Vitest 5.0.5, Playwright 1.64.1 (Chromium 156.0.8078.4), `next@16.4.0` and the React that Next ships, `19.3.0-canary-278794d7-20261002`. The measurement code is in `scripts/research/page-lifecycle/`, with its own [README](../scripts/research/page-lifecycle/README.md).

## In Short

- **Part of the premise is wrong: memory does not grow per page if the app cleans up after itself.** Over 100 loads of a route, the tab keeps about 12 to 37 KB per page. A heap diff shows that this is mostly V8 compiling hot code to machine code, not pages: three quarters of it is JIT code. At every measurement, only the page that was open was still in memory.
- **What does grow is every page that something outside the page holds on to.** A leaked page costs **0.5 MB** in the e2e demo and **2.8 MB** in the notes demo. Nothing reports it until Chromium runs out of memory.
- **While measuring, I found a leak that is not documented**: in development, `next/image` registers a `PerformanceObserver` and never disconnects it. After 50 navigations to a route with images, about 15 and 45 of the pages were still in memory, in two runs.
- **Memory is not the bigger everyday risk. Stray callbacks are.** A timer of a page that was left fires in a later test. I reproduced it in the notes demo in 1 run out of 3. The error is blamed on the next test, which did nothing wrong.
- **Recommendation: keep pages in the document, and make leaving a page observable and then owned.** First, report a page that stays in memory, the path that keeps it, and which page a stray error came from. Then make the page own its timers, listeners and observers, as a browser does, and drop them when it is left.
- **Fallback: `isolate: true`.** It frees everything between files and costs 0.75 to 1.6 s per file.
- **Not now: an iframe per page.** Page loads would be 3 to 5 times slower, and tests would lose direct access to the page's `document` and `window`.

## 1. How A Page Lives Today

### Who owns what

Everything in one tester frame of Vitest, one V8 heap.

Lives as long as the tab (the frame):

- The rsc layer: the test's own module graph, with the app's Server Components, the test files and the mocks.
- The ssr layer: one module runner, loaded once.
- Vitest's runner, its websocket, and the plugin's websocket to the dev server.
- The plugin's caches of what it fetched and compiled: `fetchedModulesOf` and `compiledModules` in `src/utils.ts`. Every page shares one compiled function per module.
- The browser context of a test: cookies, storage, and the `fetch`, `document.cookie` and `localStorage` that the plugin puts in place (`browser-context.ts`). There is one per test, not one per page.
- The document itself, its `window`, and the history.

Lives as long as one page (`Page` in `nextjs/page.ts`):

- A module runner of its own for the browser layer, so React DOM, Next's router and the app's Client Components are evaluated again for each page (`createEnvironmentRunner()`).
- Next's React root, and the roots that its components create.
- The page's `<body>` (each page gets a new one), the nodes it adds to `<head>`, the attributes of `<html>`, `<head>` and `<body>`, and the URL and history entry.
- The listeners and message channels that React and Next add while Next's client loads.

### Opening a page

`loadPage()` leaves the previous page, then:

1. Asks the server for the document and moves it into this one: `<head>` first, the rest once its stylesheets have loaded, then the inline scripts with `eval` (`loadDocument()` in `document.ts`).
2. Creates the page's runner, and records every listener added to `window` and every `MessageChannel` opened until Next's client has loaded (`leftovers.ts`).
3. Starts Next's client entry. It wraps `hydrateRoot` and `createRoot` to record the listeners React adds to the document and to the container (`client.tsx`).
4. Waits for Next's own `__NEXT_HYDRATED_CB`.

### Leaving a page

`leavePage()` releases what the page made, last first:

- Aborts its load. A page that is still starting gets up to 20 s.
- Unmounts the root and removes React's recorded listeners.
- Closes the recorded ports and removes the recorded window listeners.
- Closes the runner. An `import()` started after that never settles.
- Unloads the document (`unloadDocument()`):
  - removes the page's nodes, and puts back the attributes, URL, history entry and adopted stylesheets;
  - deletes every own property that appeared on `document`, `<html>`, `<head>` and the container while the page was open;
  - deletes `__next_f` and `__next_s`.
- Waits up to 5 s for requests still in flight, then resets the request scope.

### What it cannot see

Anything the page starts after Next's client has loaded, outside the React root:

- the app's listeners on `window` or `document`, intervals and timeouts, and globals;
- registrations with the browser itself: `PerformanceObserver`, listeners on `matchMedia()`, `BroadcastChannel`;
- module-level side effects of a dependency.

It also cannot see what the browser and V8 keep on their own.

### Leak classes

Each is reproduced by a test in this repository or by a measurement below.

| What keeps a page                              | For how long        | Seen in               |
| ---------------------------------------------- | ------------------- | --------------------- |
| A listener, interval or global of the app      | forever             | A3, C2, `memory`      |
| Next dev `next/image`: a `PerformanceObserver` | forever             | A5, I (new)           |
| A timer of a left page, which fires later      | until it fires      | F, notes suite        |
| Next's `window` globals after `cleanup()`      | until the next page | E, `memory`           |
| The element under the pointer                  | until it moves      | `memory`, notes setup |
| React's commit timer                           | 60 s                | source, not seen      |
| V8's shared descriptor arrays                  | ≤ 1 page per shape  | `memory` test         |

Notes on the table:

- **Next's `window` globals.** `_N_E_STYLE_LOAD`, `next`, `nd` and `__next_require__` keep the last page until another page replaces them. The heap snapshot of experiment E names `window._N_E_STYLE_LOAD` as the path.
- **React's commit timer.** It starts when a commit suspends on a stylesheet React has not inserted yet, or on an `<img>` in a transition. It is never cleared after the commit succeeds:
  - `waitForCommitToBeReady` starts it with `SUSPENSEY_STYLESHEET_TIMEOUT = 6e4` (lines 25819 and 30921 of `react-dom-client.development.js`);
  - `completeRoot` sets `cancelPendingCommit = null` without calling it (line 19395).
  - In 100 navigations to `/styles` (A4) and 30 to `/images` (A5) it kept no page for 60 s: Next preinitialises a route's CSS.
- **V8's shared descriptor arrays.** Since V8 `7dcf3d06ea`, which turned off descriptor-array trimming during a GC with a stack, a live shape keeps every descriptor of its shared array (`marking-visitor-inl.h`). The first page whose objects extend a shape the tab shares stays.

Three behaviours that are not memory:

- A spy on `document` made after `renderServer()` dies with the page.
- A render that waits for data outside a Suspense boundary goes on after its page is left and logs in a later test.
- An `import()` after leaving never settles.

## 2. Measurements

Method:

- One worker, so one tab.
- After three forced collections (`HeapProfiler.collectGarbage` over CDP), read `Runtime.getHeapUsage` and `Memory.getDOMCounters`.
- A `WeakRef` to each page's `callServer` (Next's `app-call-server`, a function of the page's own module graph) counts the pages still alive.
- Heap snapshots are taken from Node.js over CDP and read with `retainers.ts` and `diff.ts`.

All runs use React's development build unless they say production.

### A page that cleans up keeps nothing

E2e demo, 100 loads of `/` in one test (experiment A1):

| Pages | Heap    | Pages alive |
| ----- | ------- | ----------- |
| 0     | 40.5 MB | –           |
| 10    | 58.6 MB | 1           |
| 50    | 59.6 MB | 1           |
| 100   | 60.1 MB | 1           |

Reading the table:

- The first page fills the tab-wide caches: about 18 MB of modules, compiled once.
- After that the heap grows 17 KB per page, and only the open page is alive.
- With nodes in place of a route (A2), it grows 6 KB per page. The 100 containers stay in the body until `cleanup()` removes them: one `<div>` each.

Notes demo, 60 loads of `/notes`, signed in, with three notes (C1):

- From 121.7 to 123.6 MB between page 10 and page 60: 37 KB per page.
- One page alive.
- About 90 ms per page.

What the residue is (G): 2.5 MB over 200 pages. The top of `results/residual-diff.txt`:

> 1201 KB `InstructionStream` · 379 KB `TrustedByteArray` · 194 KB `ProtectedFixedArray` · 59 KB `Code`

That is machine code of functions that got hot and were optimised, which the pages share. It levels off; it is not pages.

### A page that leaks costs its whole module graph

In A3 and C2 the test leaks each page as an effect without a cleanup would: a `resize` listener on `window` that closes over the page's `callServer`.

| App   | Per leaked page | 60–100 pages | After the leak is gone |
| ----- | --------------- | ------------ | ---------------------- |
| e2e   | 0.51 MB         | +51 MB       | all freed              |
| notes | 2.83 MB         | +170 MB      | all freed              |

Removing the listeners brings the heap back to where a run without the leak ends, so the plugin's own cleanup is not what keeps these pages.

At 2.8 MB a page, a worker that opens 1,000 leaking pages holds about 2.8 GB, which is close to what a tab's V8 heap can hold at all (4 GB with pointer compression). Then Vitest's Playwright provider fails the run with:

> The chromium page crashed while running tests. This can happen if the browser ran out of memory.

### `isolate: true` frees it, at a cost per file

Experiment B: five identical test files of 30 pages each, in one tab, e2e demo. Heap at the start of each file:

| Run                    | File 1 | 2    | 3    | 4    | 5    |
| ---------------------- | ------ | ---- | ---- | ---- | ---- |
| `isolate: false`       | 38.6   | 58.8 | 59.3 | 59.8 | 60.1 |
| false, app leaks       | 38.6   | 72.9 | 88.1 | 103  | 118  |
| `isolate: true`, leaks | 38.6   | 39.9 | 39.9 | 39.9 | 40.0 |

A new tester frame drops everything the previous one kept, leaks included. What it costs (B and D):

| App (files) | `false` | `true` | Per extra file | First page of a file |
| ----------- | ------- | ------ | -------------- | -------------------- |
| e2e (5)     | 6.4 s   | 9.3 s  | +0.75 s        | 31 → 240–470 ms      |
| notes (4)   | 9.9 s   | 14.7 s | +1.6 s         | 131 → 530–570 ms     |

Why it costs that much (from Vitest's source):

- Vitest replaces the tester iframe for each file (`createTestIframe` in its orchestrator, `@vitest/browser` 5.0.5). It never reloads it.
- The new frame evaluates Vitest's runner and the setup files again.
- The plugin then loads Next's runtime for three layers again. The rsc layer is the frame's own module graph.
- The modules the plugin had fetched are gone too: its cache lives in the frame.

The dev server has everything compiled already, so this cost is all in the browser. For a suite of 100 files on 4 workers, that is about 40 s more in the notes demo.

### A realm per page would make every page load 3 to 5 times slower

Today every page evaluates its modules again, but compiles each module once. All pages share the compiled function, and V8 shares its bytecode (`compiledModules` in `src/utils.ts`). A fresh iframe is a fresh realm: there, each module's function has to be compiled again. To measure that without building an iframe, experiment H applies `compile-per-page.patch`. It compiles every module of every page anew, past V8's cache of `eval` code, in the same realm. Median time of `renderServer()`:

| App, build      | Shared code | Compiled per page |
| --------------- | ----------- | ----------------- |
| e2e, dev        | 17 ms       | 88 ms             |
| e2e, production | 6 ms        | 32 ms             |
| notes, dev      | 72 ms       | 184 ms            |
| notes, prod     | 32 ms       | 95 ms             |

The iframe itself is cheap. Creating a same-origin iframe and touching its document takes 1.1 ms. After 100 iframes were made and removed, the heap was 0.05 MB larger.

Not measured: whether Chromium's code cache for scripts loaded by URL could win some of this back in a new realm. That would mean loading modules as `<script>` URLs instead of through the runner.

### The `next/image` leak

Experiment I: 50 loads of `/`, each followed by `router.push("/images")`.

- In two runs, about 45 and 15 of the 50 pages were still in memory after `cleanup()`. The heap grew by 25 and 14 MB over the last 40 navigations.
- In the second run, the snapshot shows 14 of them kept by one path (`results/img-retainers.txt`):

> Pending activities → `PerformanceObserver` → its callback → `import_react` → React's internals → `FiberRootNode` → … → the page's `callServer`

- It is `next/dist/shared/lib/get-img-props.js`, line 376. In development, the first `<Image>` in a module graph creates a module-level `PerformanceObserver` for `largest-contentful-paint` and never disconnects it. In a browser it dies with the document. Here it keeps the page.
- How many pages it keeps varies from run to run, probably with whether the observer was still pending when the page was left. Not verified.
- The plugin's own leak tests (`memory.test.tsx`) never open a route with an `<Image>`, so they did not catch it.

This is the clearest sign that the list of leftovers can't be completed by enumeration. The browser has many ways to register a page-scoped resource on the window.

### A stray timer fails a later test

Experiment F, in the notes demo:

- A test clicks a link that makes the app load a page itself, and ends as soon as that page shows.
- The app's `next-themes` removes a style with a 1 ms timer after it mounts. Leaving the page has already removed that style.

In 1 run out of 3 (`results/stray-timer.log`):

> Vitest caught 4 unhandled errors during the test run.
> NotFoundError: Failed to execute 'removeChild' on 'Node': The node to be removed is not a child of this node.
> ❯ eval …/deps_react_client/next-themes.js:148:18
> The last test to run before this error was "a later test that does nothing wrong".

Both tests pass, the run fails, the error names the wrong test, and nothing says that a page was left. This is why the notes suite has `watchPageLoad()`, which waits 10 ms after a page the app loads itself.

### Workarounds in the suites

The acceptance app's 69 tests need three:

- `watchPageLoad()`, twice: the stray timer above.
- A hover on a 1 px element before each test, in `vitest.setup.ts`: the pointer keeps a page.
- `isolate: false`, with a comment telling readers not to change it.

The conformance shim has two more:

- a `sleep(50)` after every page load;
- a `MutationObserver` that deletes the globals a test set with `browser.eval()` when a new `<body>` arrives.

So these are rare, but each one took debugging to find.

### Verdict on the premise

- For an app that cleans up, memory does not grow.
- For an app that leaks, it grows linearly and silently, and a leak can come from Next itself (`next/image` in development).
- Stray callbacks are the more frequent failure, and the least debuggable: flaky, and attributed to the wrong test.
- So the risk is real, but its shape is "invisible when it happens", not "a design that cannot work".

## 3. Alternatives

### An iframe per page

The browser layer of each page runs in a new same-origin iframe. The server layers stay in the tester frame. Leaving a page removes the iframe.

What it buys:

- Real unload semantics for everything the browser ties to a document: listeners, timers, intervals, observers, ports, adopted stylesheets, pointer state.
- The leak classes above disappear, except references from the tester frame into the iframe. Those keep the whole iframe, the classic detached-window leak. Examples: a `mock.calls` with an element of the page, a test-file variable, a Request object that the server layers cache.
- Module identity does not change: today every page already gets its own instance of the `"use client"` modules.

What breaks or costs:

- **Speed.** 3 to 5 times slower page loads (H), unless code caching across realms works. The suites are dominated by page loads.
- **The white-box contract.** Tests read `document.cookie`, `window.location.pathname`, `document.title`, `document.documentElement.dataset` and `window.next.router` directly. They seed `localStorage` before `renderServer()`. All of those would be the tester's, not the page's. The playground tests do this more than 200 times, in 22 files.
- **Locators.** Vitest runs locator queries inside the tester with its own engine. Actions go through Playwright via `page.frameLocator('[data-vitest="true"]')`, at `@vitest/browser-playwright/dist/index.js:172`. A nested frame works only through `page.frameLocator(...)`:
  - `expect.element(el)` with a raw element from the iframe throws "Invalid element or locator": it checks `instanceof` against the tester's realm.
  - `userEvent.click(el)` silently falls back to a synthetic `HTMLElement.click()`.
  - `page.elementLocator(el)` builds a selector against the wrong document.
  - Every test would import a `page` from the plugin instead.
- **Errors.** Vitest's error catcher listens only on the tester's `window` (`error-catcher.js`). An error in the iframe would not fail the test unless the plugin forwards it.
- **Mocks and spies.** Vitest rewrites dynamic `import()` to a global `__vitest_browser_runner__` that the iframe does not have. Manual mocks read `__vitest_mocker__`. `vi.spyOn(window, …)`, `vi.stubGlobal` and fake timers patch only the tester.
- **A node in a container.** `renderServer(<Node />, { container })` renders into the test's own document, next to the test's own elements. An iframe can't do that.
- **Storybook.** `@storybook/nextjs-vite-rsc` renders a page per story into Storybook's preview document, including `layout: 'document'` stories that own `<body>`. With a page in a nested iframe:
  - `play` functions that query `canvasElement` would see nothing;
  - addons that read the preview document would see an empty canvas: a11y, measure, outline, backgrounds.

  A whole preview per iframe is what docs mode does with `inline: false`. Storybook PR #36971 measures that at 2–4 s and about 250 MB per story, because each one boots the server too.

- **Conformance.** The shim would need to evaluate `browser.eval()` in the frame, which is closer to Playwright. Tests with JavaScript off might become possible with `sandbox`. Those 13 are "not applicable", so they don't count in 402/474. No expected change to the score; the risk is in rewriting the shim.

Effort: 4 to 6 weeks for the plugin, the shim and the Storybook package, and a breaking change for every user's tests. It is not worth that for leaks that only exist in apps that leak, which detection can name.

### A realm without an iframe

- **ShadowRealm.** Stage 2.7 at TC39. In Chromium it is only behind V8's `--harmony-shadow-realm`, listed as not stable enough for testing. Blink has no entry, and chromestatus says "In development". By spec it has no DOM, and only primitives and callables cross its boundary. React DOM cannot run there. Dead end.
- **A Worker.** No DOM. Dead end.
- **`document.open()`.** Per the [HTML spec](https://html.spec.whatwg.org/multipage/dynamic-markup-insertion.html#document-open-steps), it erases the listeners of the document and the window, but it keeps timers, globals and the module map: whatwg/html#3918 removed the new realm. It would erase Vitest's own error listeners and the test's, and keep exactly what leaks. Dead end.

### Keep the design, and make it rigorous

Detailed in the recommendation below. In short:

- Find the pages that stay, with a forced GC once per test file (33–53 ms at a 121 MB heap, experiment J).
- Name what keeps them, from a heap snapshot.
- Name which page a stray error came from.
- Then make the page own what it registers, and drop it when it is left.

### A frame per file, pages in the document within it

That is `isolate: true`. Vitest has no option to recycle the tester per N files or under memory pressure. Its only memory measure is a forced GC after a file, and only for `isolate: true` on Linux with little free space in `/tmp` (`maybeCollectChromiumGarbage`). An upstream option like "isolate every N files" would bound leaks for less than a frame per file. With the numbers above it is not a priority.

## 4. Prior Art

The pattern: every tool either gives each test or file a new document, or reuses one document and only unmounts. None cleans up arbitrary listeners, globals or timers in a reused document.

- **Storybook** (`storybook` 11.0.0-alpha.6):
  - `@storybook/react`'s `renderToCanvas` keeps one root per canvas and returns an unmount. That is the whole teardown contract.
  - `StoryRender.runTeardown` aborts the story's signal, runs the cleanups from `beforeEach` and unmounts.
  - If a render does not finish within three ticks, it calls `window.location.reload()`.
  - Nothing else is cleaned between stories.
- **Vitest Browser Mode** (5.0.5): `isolate: true` gives each file a new same-origin iframe. `isolate: false` uses one iframe for all files. Nothing is reset per test.
- **Playwright component testing** (1.62.1): every test calls `page.goto()`, a real navigation, in a context that is reused and reset. `unmount()` is `root.unmount()`.
- **Next.js's own e2e tests** (canary `c58836ae`): `next.browser()` closes the pages of the context and opens a new one with `page.goto()` (`test/lib/browsers/playwright.ts`, `loadPage()`). Cookies carry over within a file. The conformance shim maps each one to a `renderServer()`.
- **`next-router-mock`** (1.0.5): a module singleton. Isolation between files comes from Jest's module registry.
- **Jest with jsdom** (30.5): a new `JSDOM` per file. `window.close()` clears listeners and stops timers.
- **Web Test Runner**: one page per file, then `about:blank` "to kill any running code".
- **Cypress CT**: a new AUT iframe per spec. Within a spec, it unmounts and clears storage before each test.
- **React** (`react-dom` 19.3 canary, as vendored by Next):
  - `root.unmount()` renders `null` and nulls the container marker. It never removes the listeners that `listenToAllSupportedEvents` added to the container (line 20900).
  - `__reactResources$…` on the document is never deleted.
  - The scheduler's `MessageChannel` port is never closed.
  - The plugin already handles each of these.

This plugin sits between the two groups. It reuses one document like Storybook, but it does far more than unmount. What it lacks is the second group's guarantee for what the page registers after it has loaded.

## 5. Debuggability

What a user sees today:

| Situation                  | What they see                                                                      |
| -------------------------- | ---------------------------------------------------------------------------------- |
| Pages leak                 | Nothing, then a slower suite, then "The chromium page crashed … ran out of memory" |
| A stray timer              | An unhandled error from library code, blamed on a later test, in some runs         |
| A page kept by the pointer | Nothing: one page, freed on the next hover                                         |

What they should see:

**1. After a test file that left pages in memory.** A forced GC, then:

> vitest-plugin-rsc: 23 pages that app/notes.test.tsx left are still in memory, about 2.8 MB each. Something outside the page keeps them, as an effect without a cleanup would: a listener on window, an interval, an observer, a global. The first was opened by "archive a note" with renderServer({ url: "/notes" }). Run with VITEST_RSC_DEBUG_LEAKS=1 to see what keeps it.

**2. With `VITEST_RSC_DEBUG_LEAKS=1`.** A heap snapshot of the tab, and the shortest path that keeps the oldest page:

> vitest-plugin-rsc: the page of "archive a note" is kept by:
> window → PerformanceObserver (still observing) → callback in next/dist/shared/lib/get-img-props.js:377 → the page's React
> A browser drops this with the page. Here the code that registers it has to undo it, or the test file runs with isolate: true.

The prototype of this is `retainers.ts`. It needs no new dependency, and printed the paths in this report from a 100–350 MB snapshot in about 20 s.

**3. A stray error.** When an uncaught error's stack starts in a module of a page that was left:

> vitest-plugin-rsc: code of a page that was left threw, 12 ms after "a link to a route of the app loads its page" left it (the page at /auth/sign-in that the app loaded itself). A browser stops a page's timers when it unloads it. Wait for that page in its test, or clear the timer in the effect's cleanup.
> NotFoundError: Failed to execute 'removeChild' on 'Node' … next-themes.js:148

**4. The diagnostic command.** `VITEST_RSC_DEBUG_LEAKS=1 vitest run <file>`, documented next to `isolate: true` in the guide. It needs Chromium with Playwright for CDP. In other browsers, and in Storybook outside Vitest, the detector can only count pages that a `FinalizationRegistry` has not seen collected after many more pages, which is less reliable.

## 6. Recommendation

**Keep pages in the document.** For an app that cleans up, the design costs no memory, and pages load in 6 to 90 ms. It keeps the white-box contract that makes the plugin worth using, and it is the design Storybook needs too. What it lacks is not a better mechanism but visibility, plus the browser's one guarantee: what a page registers dies with it.

### First increment: make leaving observable

About 1.5 to 2 weeks. No behaviour changes; only reports.

1. **A page sentinel.** A `WeakRef` per page to objects of its own graph:
   - Next's root;
   - the page's React DOM module;
   - the module of `app-call-server`.

   Count the left pages that are still alive after a forced GC at the end of each test file, through a browser command over CDP like `heap-snapshot-command.ts`. Two pages are allowed: the bound ones above.

2. **The message from section 5**, with the test that opened each page and the size per page (from `Runtime.getHeapUsage` before and after).
3. **`VITEST_RSC_DEBUG_LEAKS=1`**: port `retainers.ts`. Map closures to files and lines with the snapshot's `locations`.
4. **Stray errors.** Name the page a stray error came from. Tag the modules of page runners in their `sourceURL`, keep the time and the test of each leave, and annotate an uncaught error whose stack starts in such a module while no page of its own is open. A capture listener on `window` runs before Vitest's at the target in Chromium, which needs to be confirmed.
5. **Two known leftovers the plugin can take back itself:**
   - delete Next's own `window` globals (`next`, `nd`, `_N_E_STYLE_LOAD`, `__next_require__`) when no page follows;
   - move the pointer off the page at `cleanup()`, as the notes setup does by hand.
6. **A "page lifecycle contract" section in the guide:**
   - effects clean up what they add to `window` and `document`;
   - module-level registrations keep their page;
   - a test that makes the app load a page waits for it;
   - with the error messages above.

Risk:

- Conformance: none; nothing changes behaviour. The GC adds about 40 ms per file.
- Storybook: the sentinel and the stray-error note work there too. The forced GC and the snapshot work only under Vitest.

### Second increment: the page owns what it registers

About 1 to 2 weeks, with real risk.

- While a page is open, attribute every call that registers a page-scoped resource to the page's code or not, by its caller. The calls:
  - `setTimeout` and `setInterval`;
  - `requestAnimationFrame` and `requestIdleCallback`;
  - `addEventListener` on `window` and `document`;
  - `new PerformanceObserver`, `MessageChannel` and `BroadcastChannel`;
  - `matchMedia().addEventListener`.
- A call counts as the page's when its stack has a frame in a module of the page's runner. That is the same tag as in point 4.
- At leave, give the page's own `pagehide` listeners a `PageTransitionEvent`, then clear, disconnect and remove what the page owns.
- It fails open: anything not clearly the page's stays, as today. A test's own timer is never cancelled.
- Vitest's orchestrator ignores an untrusted `pagehide` (`watchUnload`, `if (!event.isTrusted) return`), so the event is safe for Vitest. It is still dispatched only to the page's own listeners, because a host library may act on `pagehide`.
- This replaces the load-window recording in `leftovers.ts`. It closes the `next/image`, `next-themes` and app-listener classes. It also gives the app the `page.close()` hook the review asked for, without a new API: `pagehide` is the platform's hook, and libraries already use it.

Gates:

- Capturing a stack on every timer call costs time. Measure it on the notes suite, and keep the overhead under 5%.
- If it is more, shadow the bare global names through the parameters of the compiled module function. That keeps the compiled code shared and misses only explicit `window.setTimeout`.

Risk:

- Conformance: it changes behaviour where code of Next relied on a timer outliving its page. A browser would not run that timer either, so the risk is to the 402 that pass, not to fidelity. Run `gh workflow run next-conformance.yml --ref <branch>` before merging, and record any change in `expectations.json`.
- Storybook: it renders through the same `renderServer()`, so it gets the same behaviour. The `layout: 'document'` stories need a test of their own.

### Fallback

If the second increment proves too fragile, keep the first and point users with leaking apps to `isolate: true`. Its cost is known: 0.75–1.6 s per file. The detector tells them when they need it. Consider asking Vitest for an `isolate` that recycles the tester every N files.

### When to revisit an iframe per page

- If Vitest gets locators and error catching that follow a nested frame;
- and Chromium's code cache makes a fresh realm cheap for this runner's modules;
- or if a class of leaks shows up that the second increment cannot attribute.

Each of those is checkable with the experiments in `scripts/research/page-lifecycle/`.

## Not Verified

- Why the `next/image` leak keeps a different number of pages from run to run.
- Whether a capture listener on `window` runs before Vitest's error listener.
- The cost of capturing a stack per timer.
- Whether Chromium's code cache helps a fresh realm.
- That the 60 s commit timer keeps a page in practice. The source says it can; A4 and A5 never saw it.
- Production-build numbers for leaks. The `next/image` observer is in development code only, line 251 onwards of `get-img-props.js`.
- The machine was an M1 Pro. CI runners are slower, so the per-file cost of `isolate: true` there will be higher.
