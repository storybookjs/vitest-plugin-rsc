# Testing Client Components

Not every component needs Next. There are roughly two kinds:

- **Connected components** get something from your app: data from a Server Component, a Server Action, a cookie, the router. Test those with `renderServer()` in a normal test file. See the [Next.js guide](nextjs-guide.md).
- **Design-system components**, like a button or a dialog, only have props and their own state. Test those in a test file that starts with `"use client"`, with plain `render()` from [vitest-browser-react](https://github.com/vitest-community/vitest-browser-react) or [Testing Library](https://testing-library.com/docs/react-testing-library/intro/).

A `"use client"` test file works just like a `"use client"` file in React: it's a client boundary. Its code runs on the same React that Next uses in the browser. So you can pass a spy as a prop, and keep state in the test:

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

Install a rendering library as a dev dependency: `vitest-browser-react`, or `@testing-library/react` with `@testing-library/dom`. The plugin has no rendering API of its own here.

Then add a setup file that _also_ starts with `"use client"`, and clean up from a hook in it:

```tsx
// vitest.setup.client.tsx
"use client";

import { beforeEach } from "vitest";
import { cleanup } from "vitest-browser-react";

beforeEach(cleanup);
```

Add it to `setupFiles` in `vitest.config.ts`, next to any server setup file.

> [!IMPORTANT]
> Register `cleanup()` yourself, as above. A module loads only once per tab, so the hook that `import "vitest-browser-react"` registers on its own only covers the first test file.

This file is also the place for other client setup that should load once per tab, like Testing Library's `configure()` or `i18n.init()`.

What about a setup file _without_ `"use client"`? That one is server code, running on the server's React. So don't import `vitest-browser-react` or `@testing-library/react` there: it breaks every test file.

## What's different in a `"use client"` test file

There's no page of your app around the component: no request, no URL, no Next router. That means:

- **`renderServer()` and Server Actions reject.** Client code can't render server code. Test those components with `renderServer()` in a normal test file.
- **The router hooks don't have a router.** `useRouter()` throws `invariant expected app router to be mounted`, and `usePathname()`, `useSearchParams()` and `useParams()` return `null`. Use `renderServer()`, or pass the value as a prop.
- **No module mocks.** `vi.mock()`, `vi.doMock()`, `vi.hoisted()` and friends are errors here. Pass a mock as a prop instead.
- **Imports are the browser's copies.** A `db` you import here isn't the one your Server Components read.
- **Links and forms can't navigate.** A click on a `<Link>` or a form submit is an uncaught error that fails the run. Test navigation with `renderServer()`. (Links with `download` still download.)
- **`fetch`, cookies and storage are the browser's own**, as with Testing Library in Browser Mode. `fetch` goes to the network, not your route handlers, and nothing gets emptied between tests.
- **CSS stays for the whole file.** What the test file and setup files import applies in every test.
- **No `act()` in production mode.** With `build: "production"`, React has no `act()`. Testing Library's `render()` needs it, and vitest-browser-react's resolves before React has rendered. Use locators, which wait.

Curious how this works? See [A Test File With `"use client"`](internals/next-routes.md#a-test-file-with-use-client).
