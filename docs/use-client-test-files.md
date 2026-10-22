# Testing Client Components in a `"use client"` test file

There are two kinds of components to test, and a kind of test file for each:

- A **connected component** gets something from your app: data from a Server Component, a Server Action, a cookie, the router. Test it with `renderServer()`, in an ordinary test file. See the [Next.js guide](nextjs-guide.md).
- A **design-system Client Component**, like a button or a dialog, gets only its props and has only its own state. Test it in a test file that starts with `"use client"`, and render it the way you would without Next: with `render()` from [vitest-browser-react](https://github.com/vitest-community/vitest-browser-react) or from [Testing Library](https://testing-library.com/docs/react-testing-library/intro/).

A test file with `"use client"` is a client boundary, just like such a file in React. Its code belongs to Next's `browser` layer and runs on the React that Next uses in the browser. So a prop can be a function, like a spy, and a component in the test file can have state:

```tsx
"use client";

import { expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { PressButton } from "./components/press-button.tsx";

test("passes a function to a Client Component, which calls it", async () => {
  const onPress = vi.fn();

  const screen = await render(<PressButton onPress={onPress}>Press</PressButton>);

  await screen.getByRole("button", { name: "Press" }).click();
  expect(onPress).toHaveBeenCalledOnce();
});
```

## Set up

Install your rendering library as a dev dependency: `vitest-browser-react`, or `@testing-library/react` and `@testing-library/dom`. The plugin has no API of its own for this, and it doesn't clean up anything the library rendered. As in Vitest without Next, the library unmounts what it rendered with its own `cleanup()`.

Set up the `browser` layer in a setup file that also starts with `"use client"`. Vitest runs it in that layer before every test file, as it runs any setup file:

```tsx
// vitest.setup.client.tsx
"use client";

import { beforeEach } from "vitest";
import { cleanup } from "vitest-browser-react";

beforeEach(cleanup);
```

Add it to `setupFiles` in your `vitest.config.ts`, next to any server setup file.

Call `cleanup()` from a hook in the setup file itself, as above. A module loads only once per tab, just as Vitest loads a module that a setup file imports once per worker with `isolate: false`. So a hook that a library registers when it loads, like the one that `import "vitest-browser-react"` registers in its docs, only applies to the first test file.

Other setup goes in this file too, because it loads once per tab:

- Testing Library's `configure()`.
- Anything the browser needs before a test, like a file that calls `i18n.init()`.

A setup file without the directive is server code. It runs in the `rsc` layer, whose React is the server's. So:

- Importing `vitest-browser-react` or `@testing-library/react` there breaks every test file.
- A file with `"use client"` that it imports is a client reference, as in React, which only loads when something renders it.

## What's different in a `"use client"` test file

There's no page of your app around the component: no request, no URL and no Next router. For a test file with `"use client"`, that means:

- **`renderServer()` rejects**, because client code can't render server code.
- **Server Actions reject.** A Server Action that a component calls needs Next's app. Test that component with `renderServer()` in a test file without the directive.
- **The `next/navigation` hooks run outside Next's app.** They're Next's own hooks, but `useRouter()` throws `invariant expected app router to be mounted`, and `usePathname()`, `useSearchParams()` and `useParams()` return `null`. Test a component that needs the router with `renderServer()`, or pass it what it reads as a prop.
- **You can't mock modules.** `vi.mock()`, `vi.unmock()`, `vi.doMock()`, `vi.doUnmock()` and `vi.hoisted()` are errors here. The file's `vi` is the page's, and its mocker replaces modules in the server's layer, not the browser's. Pass a mock as a prop instead. See [Mocks](nextjs-guide.md#mocks).
- **Imports are the browser's copies.** What the file imports is the `browser` layer's copy of a module, so a `db` it imports isn't the one your Server Components read.
- **Links and forms can't navigate**, because there's no router. A click on Next's `<Link>` or an `<a>`, or a form submit, is an uncaught error that fails the run, and the test stays where it is. Test navigation with `renderServer()`. A link with `download` is left to the browser, which downloads it. A link to a route handler that answers with a file isn't answered by your app here: test it with `renderServer()`.
- **CSS stays for the whole file.** The CSS that the test file and the setup files import applies in every test of the file. `cleanup()` unlinks it, and the plugin's setup links it again before the next test. A `renderServer()` page only has its route's CSS, as with `next start`: the CSS of the test's files steps aside while that page is open.
- **`fetch`, cookies and storage are the browser's own.** `fetch`, `document.cookie`, `cookieStore`, `localStorage` and `sessionStorage` behave as with Testing Library in Browser Mode. A `fetch` goes to the network, not to your app's route handlers, and the cookies and storage belong to the origin, which Vitest's UI shares. Nothing empties them between tests. A test file without the directive has your app's instead, in a fresh browser context for every test: see [localStorage and sessionStorage](nextjs-guide.md#localstorage-and-sessionstorage).
- **Client setup is there.** Whatever a `"use client"` setup file set up for the `browser` layer is available. A `renderServer()` page starts without it, as a Next page does: it only has what your app loads.
- **There's no `act()` in production mode.** With `build: "production"`, React has no `act()`. Testing Library's `render()` needs it, and vitest-browser-react's `render()` resolves before React has rendered. Find what it rendered with a locator, which waits. See [Development Or Production](next-routes.md#development-or-production).

See [A Test File With `"use client"`](next-routes.md#a-test-file-with-use-client) for how this works.
