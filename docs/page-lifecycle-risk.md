# Page Lifecycle: Closing Every Leak

`isolate: true` is a choice a user can make: Vitest then starts every test file in a new page, and a leak lasts one file. The plugin must never be the reason that `isolate: false` does not work. So the rule is:

- **What Next.js, React and the plugin leave behind when a page is left, the plugin takes back.** It does so in the cleanest way it can, and leaves it alone only where there is no clean way.
- **What the user's own code leaves behind is the user's**, as in an app that never reloads: a listener on `window` without a cleanup, a global, a page object that a test keeps in a variable.

This document measures what a page leaves behind today, lists every leak with what causes it, and plans how to close each one. It also makes the cleanup less magic: one place that owns what a page holds, instead of patches spread over five files.

Measured at `4d43e6ea` on an Apple M1 Pro (32 GB), with Vitest 5.0.5, Playwright 1.64.1 (Chromium 156.0.8078.4), `next@16.4.0` and the React that Next ships, `19.3.0-canary-278794d7-20261002`. The measurement code, its raw results and how to rerun each experiment are in `scripts/research/page-lifecycle/` ([README](../scripts/research/page-lifecycle/README.md)). An experiment is named by a letter below, as in that README.

## In Short

- **The per-page module graph already does most of the work.** Every page evaluates React, Next's client and the app's Client Components in a module graph of its own. Once nothing outside it points in, the whole page is freed. Over 100 loads of a route, only the open page stayed alive, and the heap grew 12 to 37 KB per page, mostly V8's machine code.
- **So a leak is always one reference from the tab into a page.** Cut each one, and the page goes.
- **Measured on 7 routes of 2 apps, these are still open:**
  - `next/image` (development): a `PerformanceObserver` that is never disconnected;
  - React DOM: a 60 s timer for a stylesheet after a client navigation;
  - React: timers of 100 and 300 ms after a page is left;
  - `next-themes`, a library of the notes demo: a 1 ms timer that throws after its page is left, every time pages load back to back;
  - Next's globals on `window`, which keep the last page;
  - the element under the pointer;
  - a page that V8 can keep through a shape the tab shares;
  - the server render of a page that was left, which goes on.
- **One mechanism closes most of them: a page gets its own timers, ports and observers.** The plugin already evaluates the page's code itself. So it can give that code the page's own `setTimeout`, `MessageChannel` and `PerformanceObserver`, and clear them when it leaves the page, as a browser does. This also replaces a global patch made during a fixed window of time with something explicit.
- **Effort**: about 3 weeks. Risk: the conformance suite (956 of 1147) and the Storybook package, which leaves pages the same way.

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
- A heap diff over 200 pages (G) shows that three quarters of that is machine code that V8 compiled for hot functions: pages share it, and it is not pages.

When something does point in, the whole page stays:

- **0.51 MB** per page in the e2e demo, **2.83 MB** in the notes demo.
- Experiments A3 and C2 leak every page through a `resize` listener on `window`.
- Removing those listeners frees every page.

At 2.8 MB, 1,000 leaked pages in one worker would come near the 4 GB that a tab's V8 heap can hold.

## 2. What A Page Leaves Behind

Experiment K records every listener on `window` and `document`, every timer, every `PerformanceObserver` and every `MessagePort` made while a page is open, with the file that made it. It prints those still there after `cleanup()`. Five routes of the e2e demo and three of the notes demo:

| Route                    | Still there after the page is left                             |
| ------------------------ | -------------------------------------------------------------- |
| e2e `/`                  | nothing                                                        |
| e2e `/` → `/images`      | `PerformanceObserver` of `next/image`                          |
| e2e `/` → `/styles`      | React DOM's 60 s timer, and one of 300 ms                      |
| e2e `/settings`, `/help` | nothing                                                        |
| notes `/`                | nothing                                                        |
| notes `/notes`           | React's 300 ms reveal timer, 100 ms timer of its Flight client |

In the notes demo the 1 ms timer of `next-themes` fires after the page is gone, and throws. No listener on `window` or `document` stays on any route: what the plugin cleans today is enough for those. The full list of `results/e2e-edges.jsonl` and `results/notes-edges.jsonl` also has a 10 s timer of PGlite, the test database. That lives as long as the tab, and is not a page.

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

### Still open

| Leak                                      | Keeps                            | For                 | Seen in       |
| ----------------------------------------- | -------------------------------- | ------------------- | ------------- |
| `next/image`'s `PerformanceObserver`      | the page's React, often the page | forever             | K, I          |
| React DOM's stylesheet timer              | the page's React DOM             | 60 s                | K             |
| React's 300 ms and Flight's 100 ms timers | the page                         | 0.3 s               | K             |
| `next-themes`' 1 ms timer                 | throws in a later test           | until it fires      | F, J, D       |
| Next's globals on `window`                | the last page                    | until the next page | E             |
| The element under the pointer             | its page                         | until it moves      | `memory` test |
| A shape that V8 shares with the tab       | one page                         | forever             | `memory` test |
| The server render of a left page          | logs in a later test             | until it ends       | Not Yet       |

Evidence for each:

- **`next/image`.** `next/dist/shared/lib/get-img-props.js`, line 376, in a development-only block from line 251. The first `<Image>` in a module graph creates a module-level `PerformanceObserver` for `largest-contentful-paint`, and nothing disconnects it. In a browser it dies with the document.
  - Blink keeps an observer alive for as long as it observes (`PerformanceObserver::HasPendingActivity`, not checked here), so the observer keeps at least the page's React and React DOM.
  - Whether it keeps the whole page depends on what React DOM's module still points to when the page is left. The path that `retainers.ts` printed runs through `rootWithPassiveNestedUpdates` (`results/img-retainers.txt`).
  - In three runs of 50 navigations to `/images` (I), 15, 35 and 41 pages stayed whole.
- **React DOM's timer.** `waitForCommitToBeReady` starts it with `SUSPENSEY_STYLESHEET_TIMEOUT = 6e4` when a commit waits for a stylesheet or an image (lines 25819 and 30921 of `react-dom-client.development.js`). After the commit, nothing clears it: `completeRoot` sets `cancelPendingCommit = null` without calling it (line 19395). K saw it after a client navigation to `/styles`.
- **`next-themes`.** With `disableTransitionOnChange`, it adds a style when it mounts and removes it with `setTimeout(..., 1)`. A page that is left within that millisecond has its style removed already, and the timer throws `NotFoundError` from `removeChild`.
  - In the notes demo, every run of pages loaded back to back throws: 36 errors for 10 loads (J, `results/stray-timer-loop.log`), and 144 for 40 in each run of D.
  - A test file whose test ends right after the app loaded a page itself throws in 1 run of 3 (F, `results/stray-timer.log`).
  - Vitest blames the error on whichever test runs then:

  > NotFoundError: Failed to execute 'removeChild' on 'Node': The node to be removed is not a child of this node.
  >
  > The last test to run before this error was "a later test that does nothing wrong".

  The notes suite only avoids it because its tests assert between two pages, or wait with `watchPageLoad()`.

- **Next's globals.** Next's client sets these on `window`:
  - `next`, `nd`, `_N_E_STYLE_LOAD`;
  - `__NEXT_HYDRATED`, `__NEXT_HYDRATED_AT`;
  - `__NEXT_IMAGE_IMPORTED`, `__next_set_public_path__`, `__NEXT_HMR_CB`, `__nextDevClientId`.

  The next page sets them again. After `cleanup()` no page follows, and the snapshot of experiment E shows `window._N_E_STYLE_LOAD` keeping the last page. `memory.test.tsx` deletes three of them by hand.

- **The pointer.** The browser keeps the element that the pointer is over. The notes demo's setup file hovers a 1 px element before every test to let go of it.
- **V8.** Since V8 `7dcf3d06ea`, a live shape keeps every descriptor of the array it shares (`memory.test.tsx`). The first page whose objects extend a shape that the tab shares, like the interop object of a CommonJS package, stays for as long as the tab.
- **The server render.** A page left before its server sent anything keeps rendering. Once its data comes, Next logs the errors of a request that is gone, possibly in a later test (Not Yet, `docs/next-routes.md`).

### Not the plugin's

What the app's own code registers on `window` or `document` after its page has loaded, like a listener in an effect without a cleanup, and what a test keeps of a page, stay the user's. That is how an app behaves that never reloads, and the user can fix it.

## 3. The Plan

### 3.1 A page gets its own timers, ports and observers

The plugin evaluates every module of a page itself (`pageLoadEvaluator` in `src/utils.ts`), through a function it compiles once and calls per page. That function already gets the module's context (`__vite_ssr_import__` and the like) as parameters. It can get the page's own versions of these too:

- `setTimeout`, `setInterval`, `requestAnimationFrame` and `requestIdleCallback`, with the functions that clear them;
- `MessageChannel`;
- `PerformanceObserver`.

Each one passes the call on to the global of that moment, and keeps what it made. Leaving the page clears the timers, closes the ports and disconnects the observers, as a browser does with a document it unloads. The page's inline scripts, which `document.ts` evaluates, get the same.

Why this is the clean way:

- It is exact. What the page's code made is what the page's runner evaluated, so there is no guessing from a stack, and no window of time in which a global is patched.
- The test's own code and the server layers keep the real globals.
- One mechanism closes several leaks:
  - the `next/image` observer;
  - React DOM's 60 s timer and React's short ones;
  - `next-themes`' stray error;
  - the scheduler's port, which `leftovers.ts` records today by patching the global `MessageChannel` while Next's client loads.
- The compiled code stays shared between pages: only the arguments differ.

What to know:

- **It reaches the app's own code too.** A timer that a Client Component of the app starts is cleared when its page is left, as in a browser. The test's own timers are not.
- **It misses some calls.** A call through `window.setTimeout` or `globalThis.setTimeout` uses the real global, and is not taken back. React, Next, `next/image` and `next-themes` all call the bare names.
- **A module may declare the name itself.** One that declares `const setTimeout` at its top level would clash with the parameter, so the module's code runs in a function of its own inside the compiled one.
- **Fake timers.** The page's `setTimeout` calls the global one at the moment of the call, so `vi.useFakeTimers()` still applies. A timer is cleared with the function of the timers that made it.

### 3.2 Next's globals and the pointer

- When the page is left and no page follows, delete the globals that Next's client sets. That is a list from Next's source, checked when a run starts, like the plugin's other checks of Next's runtime (`project/`).
- At `cleanup()`, move the pointer off the page, as the notes setup does by hand today, and drop that from the setup. This works only under Vitest; another host has no pointer to move.

### 3.3 The server render of a left page

Leaving a page aborts its request. The plugin's server in front of the app should close the response then. Next stops a render whose response has closed, as it does on Node.js when a browser goes away. That removes the item from Not Yet.

### 3.4 The page that V8 keeps

Find which shape it is, with `retainers.ts` on a snapshot after a run of `memory.test.tsx`. If the plugin creates the objects whose shape the pages extend, like the interop object of a CommonJS package, it can create them per page instead. If there is no clean fix, it stays one page per shape, and the docs say so.

### 3.5 One place that owns a page

Today what a page holds is released from five files:

- `page.ts`: the releases of a page, last first;
- `client.tsx`: the root, and React's listeners;
- `leftovers.ts`: what is recorded while Next's client loads;
- `document.ts`: the nodes, attributes and properties of the document;
- `utils.ts`: the runner.

Make it one page scope in `page.ts` that lists everything a page owns, made and released in one place, with the bindings of 3.1 as part of it. `leftovers.ts` keeps recording only the listeners that Next adds to `window` while it loads. Those it adds through `window.addEventListener`, which a parameter cannot replace. Experiment K shows that recording them is enough. Reading what a page owns becomes reading one file. That is the "less magic" part.

### 3.6 Tests

Make experiment K a test of the plugin, in `playground/nextjs-e2e-demo/app/memory.test.tsx`. It asserts that after a page is left, no timer, port, observer or listener of the page is left, on routes with:

- `next/image`;
- a client navigation to stylesheets;
- `next-themes`;
- a portal.

Add a test that loads pages back to back with `next-themes` and expects no unhandled error. Then lower the `memory` tests from "at most one page stays" to none, once 3.4 is done.

### Order, effort, risk

| Step                      | Effort   |
| ------------------------- | -------- |
| 3.1 the page's own timers | 4–6 days |
| 3.2 globals and pointer   | 1 day    |
| 3.3 the server render     | 1–2 days |
| 3.4 the V8 page           | 1–3 days |
| 3.5 one page scope        | 2–3 days |
| 3.6 tests                 | 2 days   |

About 3 weeks in all. 3.1 and 3.6 together are the first increment: they close the leaks that cost the most, and the stray errors.

Risk:

- **Conformance** (956 of 1147 pass). 3.1 and 3.3 change when the work of a left page stops. A browser stops it too, so a test that passes should keep passing, but that has to be shown. Run `gh workflow run next-conformance.yml --ref <branch>` before merging, and record any change in `conformance/expectations.json`.
- **Storybook.** `@storybook/nextjs-vite-rsc` renders a page per story with the same `renderServer()`, so it gets the same cleanup. Stories with `layout: 'document'` need a test of their own. The pointer of 3.2 is Vitest's only.

## 4. When A User's Own Code Leaks

The user's own leaks stay theirs, but they should be able to find them. A small, separate addition:

- After a test file, force a GC (33–53 ms at a 121 MB heap, J), and count the pages still alive.
- If any are, say so, with the test that opened each.
- With `VITEST_RSC_DEBUG_LEAKS=1`, print the path that keeps a page, from a heap snapshot. `retainers.ts` is the prototype. It parses the whole snapshot in memory, so for 100–350 MB it needs a worker with a larger heap, or a parser that streams.

## 5. Alternatives Considered

- **`isolate: true`.** A user's choice, not the plugin's fix. It frees everything between files, and costs about 0.6 s per file in the e2e demo and 1.2 to 1.4 s in the notes demo (B and D, two runs each). The cost is loading Next's server for three layers again in Vitest's new tester frame.
- **An iframe per page.** The browser would unload a page whole, but it costs too much:
  - A new realm compiles every module again. Measured as a proxy, by compiling every module anew in the same realm (H): a page loads 2.6 to 5.3 times slower.
  - Tests lose direct access to the page's `document`, `window`, `location` and storage. The playground tests use that more than 200 times, in 22 files.
  - `page.getByRole()` only reaches a nested frame through `page.frameLocator()`, and Vitest's error catcher listens only on its own frame.
- **ShadowRealm, a Worker, `document.open()`.** None of these is a way out:
  - ShadowRealm has no DOM, and Chromium has it only behind a V8 flag.
  - A Worker has no DOM.
  - `document.open()` erases the listeners of the document and the window, Vitest's included, but keeps timers and globals.
- **Prior art.** Every other tool either gives each test or file a new document, or reuses one and only unmounts:
  - Playwright component testing, Next's own e2e tests, Vitest with `isolate`, Jest with jsdom and Web Test Runner give a new document;
  - Storybook and Cypress within a spec reuse one and unmount.

  None takes back what a reused page registered.

## Not Verified

- What it costs to call timers through the page's own functions, which is one call more per timer. To measure in 3.1.
- Which shape V8 keeps a page by. That is 3.4.
- That the 60 s timer of React DOM keeps a whole page and not only React DOM. K saw the timer; the `WeakRef` count of A4 saw no page kept.
- Leaks in production builds: `next/image`'s observer is in development code only.
- The machine was an M1 Pro. On CI runners the cost of `isolate: true` per file will be higher.
