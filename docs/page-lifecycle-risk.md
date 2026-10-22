# Page Lifecycle: Closing Every Leak

`isolate: true` is a choice a user can make: Vitest then starts every test file in a new iframe, and a leak lasts one file. The plugin must never be the reason that `isolate: false` does not work. So the rule is:

- **What Next.js, React and the plugin leave behind when a page is left, the plugin takes back.** It does so in the cleanest way it can, and leaves it alone only where there is no clean way.
- **What the user's own code and its libraries leave behind is the user's**, as in any test setup: a listener on `window` without a cleanup, a global, a timer that fires after its test. For a library that leaves a timer, the guide has a recipe.

This document measures what a page leaves behind today, sorts every leak by that rule, and plans how the plugin closes its share. It also makes the cleanup less magic: one place that owns what a page holds, instead of patches spread over several files.

Measured at `4d43e6ea` on an Apple M1 Pro (32 GB), with Vitest 5.0.5, Playwright 1.64.1 (Chromium 156.0.8078.4), `next@16.4.0` and the React that Next ships, `19.3.0-canary-278794d7-20261002`. The measurement code, its raw results and how to rerun each experiment are in `scripts/research/page-lifecycle/` ([README](../scripts/research/page-lifecycle/README.md)). An experiment is named by a letter below, as in that README.

## In Short

- **The per-page module graph already does most of the work.** Every page evaluates React, Next's client and the app's Client Components in a module graph of its own. Once nothing outside it points in, the whole page is freed. Over 100 loads of a route, only the open page stayed alive, and the heap grew 12 to 37 KB per page, mostly machine code that V8 compiled.
- **So a leak is always a reference from the tab into a page.** Cut each one, and the page goes.
- **What Next and React still leave behind:**
  - in development, `next/image`'s `PerformanceObserver`, which is never disconnected;
  - React DOM's timers for a stylesheet (60 s) and for images;
  - the timer of React's Flight client;
  - Next's globals and the globals of React's inline scripts on `window`;
  - the element under the pointer;
  - a page that V8 can keep through a shape the tab shares;
  - the server render of a page that was left.
- **What the app's libraries leave is the user's, with a recipe.** The 1 ms timer of `next-themes` fires after its page is left and throws, every time pages load one after another: 36 errors for 10 page loads. Vitest's fake timers, run before the page is left, take that to none, and the notes suite passes with them. The recipe is in the guide: [A timer that outlives its page](nextjs-guide.md#a-timer-that-outlives-its-page).
- **The plan: Next's own files get the page's timers, ports and observers.** The plugin already rewrites Next's files as Vite pre-bundles them. The same kind of rewrite points `setTimeout`, `MessageChannel` and `PerformanceObserver` in those files, which include the React that Next ships, at the page that runs them. Leaving the page releases them. The app's code and its other packages keep the real globals.
- **Effort**: about 3 weeks. Risk: the conformance suite (956 of 1147 pass) and the Storybook package, which leaves pages the same way.

## 1. Why A Left Page Can Be Freed

A page owns its own module runner for the browser layer (`createEnvironmentRunner()` in `src/utils.ts`). Every page evaluates React DOM, Next's router and the app's Client Components again. Only the compiled code is shared between pages. So when a page is left, everything it made is garbage, unless something that lives as long as the tab still points into it:

- the document, `<html>`, `<head>`;
- `window` and its globals;
- a timer, port or observer that the browser keeps;
- the server layers;
- the test's own variables.

Measured (experiment A, e2e demo, 100 loads of `/`, after a forced GC):

| Pages | Heap (MiB) | Pages alive |
| ----- | ---------- | ----------- |
| 0     | 40.5       | –           |
| 10    | 58.6       | 1           |
| 100   | 60.1       | 1           |

- The first page fills the caches that every page shares.
- After that the heap grows about 17 KB per page. In the notes demo, on a signed-in `/notes`, it is about 37 KB (C).
- A heap diff over 200 pages (G) shows that three quarters of that is machine code that V8 compiled for hot functions. Pages share it, and it is not pages.

When something does point in, the whole page stays:

- **0.51 MB** per page in the e2e demo, **2.83 MB** in the notes demo.
- Experiments A3 and C2 leak every page through a `resize` listener on `window`.
- Removing those listeners frees every page.

At 2.8 MB, 1,000 leaked pages in one worker would come near the 4 GB that a tab's V8 heap can hold.

## 2. What A Page Leaves Behind

Experiment K records, while a page is open, the file that made each of these:

- every `setTimeout` and `setInterval`, every `PerformanceObserver` and every `MessageChannel`;
- every listener added to `window` and `document` with their own `addEventListener`.

It prints the ones still there 50 ms after `cleanup()`. It does not see a timer that fired before that, or `requestAnimationFrame`, `requestIdleCallback`, other observers, `matchMedia()` or `BroadcastChannel`. It ran on five routes of the e2e demo and two of the notes demo, where `/notes` was left twice: once settled, once right after it hydrated.

| Route                    | Still there after the page is left                           |
| ------------------------ | ------------------------------------------------------------ |
| e2e `/`                  | nothing                                                      |
| e2e `/` → `/images`      | `next/image`'s `PerformanceObserver`                         |
| e2e `/` → `/styles`      | React DOM's stylesheet timer (60 s) and image timer (800 ms) |
| e2e `/settings`, `/help` | nothing                                                      |
| notes `/`                | nothing                                                      |
| notes `/notes`           | the 300 ms timer of React's inline scripts                   |
| notes `/notes`, at once  | that, and the 100 ms timer of React's Flight client          |

No listener on `window` or `document` stays on any of these routes: what the plugin cleans today is enough there. The notes demo also has a 10 s timer of PGlite, the test database, which lives as long as the tab and is not a page's.

### Taken back today

| What                                               | Who    | How (file)                                    |
| -------------------------------------------------- | ------ | --------------------------------------------- |
| The root, and React's listeners on the document    | React  | recorded around `createRoot` (`client.tsx`)   |
| `__reactResources$…` and the other markers         | React  | own properties since the page (`document.ts`) |
| Listeners on `window` while Next's client loads    | Next   | recorded in that time (`leftovers.ts`)        |
| The scheduler's `MessageChannel`                   | React  | recorded in that time (`leftovers.ts`)        |
| The page's `<body>`, nodes in `<head>`, attributes | page   | put back (`document.ts`)                      |
| `__next_f`, `__next_s`, `currentScript`            | Next   | deleted (`document.ts`, `client.tsx`)         |
| The Flight client's `__webpack_require__`          | plugin | replaced (`page.ts`)                          |
| The runner, its loader of Client Components        | plugin | closed (`page.ts`, `client.tsx`)              |

`leavePage()` in `page.ts` also waits for the server's requests and resets the request scope, and `cleanup()` closes the test's browser context.

### Still open: the plugin's to close

| Leak                                       | For                 | Seen in       |
| ------------------------------------------ | ------------------- | ------------- |
| `next/image`'s `PerformanceObserver`       | forever             | K, I, A5      |
| React DOM's stylesheet and image timers    | 60 s, 0.8 s         | K             |
| The timer of React's Flight client         | 0.1 s               | K             |
| The timer of React's inline scripts        | 0.3 s               | K             |
| Next's globals on `window`                 | until the next page | E             |
| The globals of React's inline scripts      | until the next page | source        |
| `useReportWebVitals`' listeners, observers | possibly forever    | source        |
| The element under the pointer              | until it moves      | `memory` test |
| A shape that V8 shares with the tab        | forever, ≤ 1 page   | `memory` test |
| The server render of a left page           | until it ends       | Not Yet       |

Evidence for each:

- **`next/image`.** `next/dist/shared/lib/get-img-props.js`, line 376, in a development-only block from line 251. The first `<Image>` in a module graph creates a module-level `PerformanceObserver` for `largest-contentful-paint`, and nothing disconnects it. In a browser it dies with the document.
  - It keeps at least the page's React and React DOM.
  - Whether it keeps the whole page depends on what React DOM's module still points to when the page is left. The path that `retainers.ts` printed runs through React DOM's `rootWithPassiveNestedUpdates` (`results/img-retainers.txt`).
  - Of 50 navigations to `/images` (I), 15, 35 and 41 pages stayed whole in three runs. Of 30 in A5, one did.
- **React DOM's timers.** `waitForCommitToBeReady` starts them when a commit waits for a stylesheet or an image (line 25819 of `react-dom-client.development.js`): `SUSPENSEY_STYLESHEET_TIMEOUT` is 60 s and `SUSPENSEY_IMAGE_TIMEOUT` 800 ms (line 30921). After the commit nothing clears them: `completeRoot` sets `cancelPendingCommit = null` without calling it (line 19395). Their closure holds React DOM's module. In A4, 100 navigations to `/styles` kept no whole page.
- **React's inline scripts.** The HTML that React streams has scripts that define `$RB`, `$RC`, `$RM`, `$RR`, `$RS`, `$RT`, `$RV` and `$RX` on `window`. `document.ts` evaluates them. They queue their reveal with a timer of up to 300 ms. The plugin takes over `$RC` (`browser-context.ts`); the others stay until the next page sets them again.
- **Next's globals.** Next's client sets these on `window`:
  - `next`, `nd`, `_N_E_STYLE_LOAD`;
  - `__NEXT_HYDRATED`, `__NEXT_HYDRATED_AT`;
  - `__NEXT_IMAGE_IMPORTED`, `__next_set_public_path__`, `__NEXT_HMR_CB`, `__nextDevClientId`.

  The next page sets them again. After `cleanup()` no page follows, and the snapshot of experiment E shows `window._N_E_STYLE_LOAD` keeping the last page. `memory.test.tsx` deletes three of them by hand.

- **`useReportWebVitals`.** In an app that calls it, Next's `web-vitals` (`next/dist/compiled/web-vitals`) adds listeners for `visibilitychange`, `pageshow` and `prerenderingchange`, and `PerformanceObserver`s, after the page has loaded, and removes only some of them. Not measured: no route here uses it.
- **The pointer.** The browser keeps the element that the pointer is over. The notes demo's setup file hovers a 1 px element before every test to let go of it.
- **V8.** Since V8 `7dcf3d06ea`, a live shape keeps every descriptor of the array it shares (`memory.test.tsx`). The first page whose objects extend a shape that the tab shares, like the interop object of a CommonJS package, stays for as long as the tab.
- **The server render.** A page left before its server sent anything keeps rendering. Once its data comes, Next logs the errors of a request that is gone, possibly in a later test (Not Yet, `docs/next-routes.md`).

### Still open: the user's

**The app's own code and its libraries.** A listener on `window` that an effect never removes, a global, an interval: those keep their page here as they would in an app that never reloads. A timer that is still due when its test ends fires in the next test, as in any test setup that unmounts between tests. That is how `next-themes` throws, in the notes demo:

- With `disableTransitionOnChange`, it adds a style when it mounts, and removes it again with `setTimeout(..., 1)`.
- Leaving the page has already removed that style, so the timer throws `NotFoundError` from `removeChild`. In a browser it would have died with the page; in a test without pages it would have found its style.
- Ten page loads in a row throw 36 times (J, `results/stray-timer-loop.log`; the same in all three runs of the control of L), and 40 throw 144 times in each run of D.
- A test that ends right after the app loaded a page itself threw in one of three runs (F, `results/stray-timer.log`).
- Vitest blames whichever test runs then:

  > NotFoundError: Failed to execute 'removeChild' on 'Node': The node to be removed is not a child of this node.
  >
  > The last test to run before this error was "a later test that does nothing wrong".

**The recipe (L).** Run such timers before the plugin leaves the page. Install Vitest's fake timers for `setTimeout`, `clearTimeout` and `Date`, with `shouldAdvanceTime`, before each test. After each test, call `vi.runOnlyPendingTimersAsync()` before the plugin's own `afterEach` leaves the page. A test that opens another page calls it before that too.

- With the recipe, the same cases throw nothing, in three runs out of three. Without it they throw 36 times in each of three runs (`results/notes-recipe-*.jsonl`).
- The notes suite passes with the recipe in its setup file: 69 of 69 tests, no unhandled errors (`results/notes-suite-recipe.txt`).
- Two variants failed:
  - Without `Date` faked, fake timers undo the clock that the notes demo fixes with `vi.setSystemTime()`, and one test failed.
  - `advanceTimersByTimeAsync(20_000)` instead of running the pending timers waited past the hooks' timeout in 15 tests.

The guide has it, under [A timer that outlives its page](nextjs-guide.md#a-timer-that-outlives-its-page), and Not Yet points there.

## 3. The Plan

### 3.1 Next's files get the page's timers, ports and observers

`nextProductionPlugin()` in `build.ts` already rewrites the files of `next/dist` as Vite pre-bundles them, with a define of oxc. Those files include the React, React DOM, scheduler and Flight client that Next ships. `server-code.ts` already does the same for server code, mapping globals like `setImmediate` to the plugin's registry.

In the browser layer, the same kind of define points these names at a scope that the page's runner passes to each module it evaluates, as it passes the module's context today:

- `setTimeout`, `clearTimeout`, `setInterval` and `clearInterval`;
- `MessageChannel`;
- `PerformanceObserver`;
- each also as `globalThis.`, `self.` and `window.`.

The scope passes each call on to the global of that moment, so the test's fake timers still apply, and keeps what it made. Leaving the page clears the timers, closes the ports and disconnects the observers. A call that a left page's code makes after that makes nothing.

Why this is the clean way:

- **It reaches exactly Next's and React's code.** Only their files are rewritten, and only the runner of a page passes a page's scope. Runners outside a page get one with the real globals: the runner of `"use client"` test files, and the ssr layer. The app's code and its other packages are untouched, which is the rule.
- **It is decided when the file is compiled.** No global is patched for a window of time, and no stack is read.
- **The compiled code stays shared between pages.** Only the scope differs, and a define in a pre-bundle runs once per run.
- **It closes the list above:** `next/image`'s observer, React DOM's timers, the Flight client's timer, and `useReportWebVitals`' observer. It also closes the scheduler's port, which `leftovers.ts` records today by patching the global `MessageChannel` while Next's client loads. That patch goes.

To check while building it: that oxc's define takes `window.setTimeout` and `self.setTimeout`, as it takes `globalThis.setTimeout` in `server-code.ts`. `useReportWebVitals`' listeners go through `addEventListener` on `document` and `window`. If a define can't reach those, the page's scope records them for Next's files only.

### 3.2 Globals, the pointer

- At every leave, delete the globals that Next's client and React's inline scripts set on `window`. That is a list from their source, checked when a run starts, like the plugin's other checks of Next's runtime (`project/`).
- At `cleanup()`, move the pointer off the page, as the notes setup does by hand today, and drop that from the setup. This works only under Vitest; another host has no pointer to move.

### 3.3 The server render of a left page

Leaving a page aborts its request. The plugin's server in front of the app should close the response then. On Node.js, Next stops a render whose response has closed. Whether it does so here is not verified.

### 3.4 The page that V8 keeps

Find which shape it is, with `retainers.ts` on a snapshot after a run of `memory.test.tsx`. If the plugin creates the objects whose shape the pages extend, like the interop object of a CommonJS package, it can create them per page instead. If there is no clean fix, it stays one page per shape, and the docs say so.

### 3.5 One place that owns a page

Today what a page holds is made and released across:

- `page.ts`: the releases of a page, last first, and the server's requests;
- `client.tsx`: the root, and React's listeners;
- `leftovers.ts`: what is recorded while Next's client loads;
- `document.ts`: the nodes, attributes and properties of the document;
- `utils.ts`: the runner.

Make it one page scope in `page.ts` that lists everything a page owns, made and released in one place, with the scope of 3.1 as part of it. `leftovers.ts` keeps only the listeners that Next adds to `window` while its client loads, unless 3.1 reaches those too. Reading what a page owns becomes reading one file. That is the "less magic" part.

### 3.6 Tests

- Make experiment K a test of the plugin, in `playground/nextjs-e2e-demo/app/memory.test.tsx`. It asserts that after a page is left, nothing of Next's or React's stays. The routes cover `next/image`, a client navigation to stylesheets, `useReportWebVitals` and a portal.
- Lower the `memory` tests from "at most one page stays" to none, once 3.4 is done.
- The README's quick start now uses Vitest's default `isolate`, but every Next.js project in CI sets `isolate: false`. Add a project that runs the e2e demo with the default, so that both settings are tested.

### Order, effort, risk

| Step                         | Effort   |
| ---------------------------- | -------- |
| 3.1 Next's files, page scope | 4–6 days |
| 3.2 globals and pointer      | 1 day    |
| 3.3 the server render        | 1–2 days |
| 3.4 the V8 page              | 1–3 days |
| 3.5 one page scope           | 2–3 days |
| 3.6 tests and the CI project | 2–3 days |

About 3 weeks in all. 3.1 and 3.6 together are the first increment: they close the leaks that keep whole pages.

Risk:

- **Conformance** (956 of 1147 pass). 3.1 and 3.3 change when the work of a left page stops. A browser stops it too, so a test that passes should keep passing, but that has to be shown. Run `gh workflow run next-conformance.yml --ref <branch>` before merging, and record any change in `conformance/expectations.json`.
- **Storybook.** `@storybook/nextjs-vite-rsc` renders a page per story with the same `renderServer()`, so it gets the same cleanup. Stories with `layout: 'document'` need a test of their own. The pointer of 3.2 is Vitest's only.

## 4. Alternatives Considered

- **`isolate: true`.** A user's choice, not the plugin's fix. It frees everything between files. After the first file, it costs about 0.6 s more per file in the e2e demo and 1.2 to 1.4 s in the notes demo (B and D, two runs each), because Vitest's new iframe loads Next's server for three layers again.
- **An iframe per page.** The browser would unload a page whole, but it costs too much:
  - A new realm compiles every module again. Measured as a proxy, by compiling every module anew in the same realm (H): a page loads 2.6 to 5.3 times slower.
  - Tests lose direct access to the page's `document`, `window`, `location` and storage. The playground tests use that more than 200 times, in 22 files.
  - `page.getByRole()` only reaches a nested frame through `page.frameLocator()`, and Vitest's error catcher listens only on its own frame.
- **Page-scoped timers for all of a page's code.** The same scope as 3.1, passed to every module of the page, would also stop the app's timers. That would fix `next-themes` without a recipe. It is out: the app's timers are the user's, as in any other test setup.
- **ShadowRealm, a Worker, `document.open()`.** None of these is a way out:
  - ShadowRealm has no DOM, and Chromium has it only behind a V8 flag.
  - A Worker has no DOM.
  - `document.open()` erases the listeners of the document and the window, Vitest's included, but keeps timers and globals.
- **Prior art.** Other tools either give each test or file a new document, or reuse one and only unmount:
  - a new document: Playwright component testing, Next's own e2e tests, Vitest with `isolate`, Jest with jsdom, Web Test Runner, and Cypress component testing for each spec;
  - one document, unmounted: Storybook, and Cypress component testing within a spec.

  None takes back what a reused page registered.

## Not Verified

- That oxc's define reaches `window.setTimeout` and `self.setTimeout`, and the listeners of `useReportWebVitals` (3.1).
- What it costs to call timers through the page's scope, one call more per timer.
- Which shape V8 keeps a page by (3.4).
- That Next stops a render here when its response closes (3.3).
- Leaks in production builds: `next/image`'s observer is in development code only.
- The machine was an M1 Pro. On CI runners the cost of `isolate: true` per file will be higher.
