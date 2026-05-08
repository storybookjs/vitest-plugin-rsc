# vitest-plugin-rsc

> 🔬 **Experimental** Vitest plugin that brings first‑class **unit testing for [React Server Components](https://react.dev/reference/rsc)** (RSC) into your project.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
![npm](https://img.shields.io/npm/v/vitest-plugin-rsc)

## 📋 Requirements

The plugin currently **requires Vitest’s browser mode**.

## ⚡ Quick start

### 1. Install the package

```bash
npm install -D vitest-plugin-rsc
pnpm add -D vitest-plugin-rsc
yarn add -D vitest-plugin-rsc
bun add -D vitest-plugin-rsc
```

### 2. Register the plugin in `vitest.config.ts`

```ts
// vitest.config.ts
import { defineConfig } from "vitest/config";
import { vitestPluginRSC } from "vitest-plugin-rsc";

// optionallly also add the next plugin
import { vitestPluginNext } from "vitest-plugin-rsc/nextjs/plugin";

export default defineConfig({
  plugins: [vitestPluginRSC(), vitestPluginNext()],
  test: {
    browser: {
      enabled: true,
      provider: "playwright",
      instances: [{ browser: "chromium" }],
    },
    setupFiles: ["./src/vitest.setup.ts"],
  },
});
```

### 3. Boot the runtime

```ts
// src/vitest.setup.ts
import { beforeAll, beforeEach } from "vitest";
import { cleanup, initialize } from "vitest-plugin-rsc/testing-library";
// or
import { cleanup, initialize } from "vitest-plugin-rsc/nextjs/testing-library";

beforeAll(() => {
  initialize(); // ⬅️ spins up the RSC runtime
});

beforeEach(async () => {
  await cleanup(); // ⬅️ reset DOM between tests
});
```

### 4. Write your first RSC test

```tsx
import { expect, test, screen } from "vitest";
import { renderServer } from "vitest-plugin-rsc/testing-library";
import { userEvent } from "@testing-library/user-event";
import { http } from "msw";

import { Users } from "./users";
import { api } from "../lib/api";
import { getLikes } from "../lib/db";
import { msw } from "../test/msw";

test("increments likes on click", async () => {
  msw.use(http.get(api("/users"), () => Response.json([{ id: 5, name: "Ada" }])));

  await renderServer(<Users />);

  expect(await getLikes(5)).toBe(0);

  await userEvent.click(await screen.findByRole("button", { name: /toggle/i }));

  await userEvent.click(await screen.findByRole("button", { name: /like/i }));

  expect(await screen.findByText("+1")).toBeVisible();
  expect(await getLikes(5)).toBe(1);
});
```

### 5. Use together with nextjs

Nextjs needs some extra configuration to get working, and to provide the necessary providers.

The NextRouter component provides all necessary providers:

```tsx
<NextRouter url="/note/someid/someslug?query=1" route="/note/[id]/[slug]">
  <NoteEditor initialTitle={title} initialBody={body} />
</NextRouter>
```

The url and route are optional, but necessary when your component uses the Link component or hooks such as:

`usePathname`, `useParams`, `useSearchParams`

Here is a full example how you can unit test a nextjs component in vitest:

```tsx
import { screen, waitFor } from "@testing-library/dom";
import { userEvent } from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import {
  expectToHaveBeenNavigatedTo,
  NextRouter,
  renderServer,
} from "vitest-plugin-rsc/nextjs/testing-library";
import { setNote } from "../libs/notes";
import { getUser } from "../libs/session";
import NoteEditor from "./note-editor";

vi.mock(import("../libs/session"), { spy: true });
vi.mock(import("../libs/notes"), () => ({ setNote: vi.fn() }));

test("note editor saves note and redirects after submitting note", async () => {
  const created_by = "kasper";
  vi.mocked(getUser).mockReturnValue(created_by);
  const title = "This is a title";
  const body = "This is a body";

  await renderServer(
    <NextRouter url="/note/edit">
      <NoteEditor noteId={null} initialTitle={title} initialBody={body} />
    </NextRouter>,
  );

  await userEvent.click(await screen.findByRole("menuitem", { name: "Done" }));
  const id = Date.now().toString();
  await waitFor(() => expectToHaveBeenNavigatedTo({ pathname: `/note/${id}` }));
  expect(setNote).toHaveBeenLastCalledWith(id, {
    id,
    title,
    body,
    created_by,
    updated_at: Date.now(),
  });
});
```

---

## 🛠️ How it works

### Vitest plugin with 2 environments

The implementation of `renderServer` function simply serializes the server component tree to react flight data with `renderToReadableStream` and then deserializes it back to JSX with `createFromReadableStream`:

```tsx
import { renderToReadableStream } from "@vitejs/plugin-rsc/react/rsc";

// 👇 this is imported with a helper, to get the correct export conditions in the module resolution
const { createFromReadableStream } = await importReactClient("@vitejs/plugin-rsc/react/browser");

// serialize
const flightStream = renderToReadableStream(<ServerComponent />);
// deserialize
const jsx = await createFromReadableStream(flightStream);
```

The vitest plugins spawns 2 environments.

1. The react-server environment is a `client` environment, but has the `react-server` condition applied, and the right server specific transformation to turn client components in references.
2. A second client environment `react_client` is created that to render the client components marked with `use client`, deserialize the flight stream and to render the JSX to the dom.

### Transformations

The transformations of the vite plugin will make sure that for a client import in the server tree like:

```tsx
"use client";
import { useState } from "react";

export function Like() {
  const [count, setCount] = useState(0);
  return (
    <>
      <button onClick={() => setCount(count + 1)}>Like</button>
      <span>{count ? ` +${count} ` : ""}</span>
    </>
  );
}
```

Is transformed to a reference:

```tsx
import { registerClientReference } from "@vitejs/plugin-rsc/vendor/react-server-dom/server";

export const Like = registerClientReference(
  /* fallback */,
  "file:///my-app/components/like.tsx",
  "Like"
);
```

For now I have copied over the specific transformations I needed from the RSC plugin from @hi-ogawa, as the specific stuff I needed was not included in the exports of the plugin.

### Vite Environment API

I'm using the vite environment API, this allows to import the client modules using an import helper:

```tsx
import { ESModulesEvaluator, ModuleRunner } from "vite/module-runner";

const runner = new ModuleRunner(
  {
    sourcemapInterceptor: false,
    transport: {
      invoke: async (payload) => {
        const response = await fetch(
          "/@vite/invoke-react-client?" +
            new URLSearchParams({
              data: JSON.stringify(payload),
            }),
        );
        return response.json();
      },
    },
    hmr: false,
  },
  new ESModulesEvaluator(),
);

export const importReactClient = runner.import.bind(runner);
```

And a server handler to resolve the import with the right conditions and transformations:

```tsx
const plugin = {
  configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      const url = new URL(req.url ?? "/", "https://any.local");
      if (url.pathname === "/@vite/invoke-react-client") {
        const payload = JSON.parse(url.searchParams.get("data")!);
        const result = await server.environments["react_client"]!.hot.handleInvoke(payload);
        res.end(JSON.stringify(result));
        return;
      }
      next();
    });
  },
};
```

### Direction forward

I think this is the best way forward for unit-testing/component testing RSC's.
Running both the server and client in the same runtime, might seem weird at first, I think it is the only way to get a unit test like experience.
In a unit test, you want to be able to run any function or component in the unit test, not only specific routes.
You also want to easily mock globals, time, http, modules, fs etc.

For example, in this approach, you can mock the date in the backend and frontend with a simple line before your test:

```tsx
test("allows purchases within business hours", async () => {
  // set hour within business hours
  const date = new Date(2000, 1, 1, 13);
  vi.setSystemTime(date);
  await renderServer(<PurchaseItem />);
});
```

Or mock out http endpoints (both in the backend and client):

```tsx
test("users mock", async () => {
  msw.use(http.get(api("/users"), () => Response.json([{ id: 5, name: "some user" }])));

  await renderServer(<Users />);
});
```

#### Using vitest browser mode

At this moment, I only got it working with vitest browser mode, not yet with jsdom.
It might seem useful to run it in jsdom, as RSC often run in node as well.
Personally, I think that is very useful to get visual feedback of your react components in `vitest` or `storybook`.

Also it is easier to mock our node correctly, than mock out the browser correctly.

Especially, because in modern code people often use web based API's in the RSC components such as:
`fetch`, `Headers`, `Request`, `Response`, `crypto`, `TextEncoder`, `TextDecoder`, `URL`, `Blob`, `File`, `FormData`, `atob`, `btoa`, `ReadableStream`,

The filesystem is easily mocked out with an in-memory file system:
https://vitest.dev/guide/mocking.html#file-system
Which is in general a good practice; to isolate your unit tests from IO.

And even for databases there are many browser friendly in-memory implementations:
https://github.com/morintd/prismock
https://github.com/oguimbal/pg-mem
