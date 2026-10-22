# React Server Components without Next.js

`vitestPluginRSC()` on its own renders Server Components for any React app. There's no request and no router: `renderServer` renders a node to a Flight stream and reads it back, in the same test runtime.

On its own, the plugin only provides `node:async_hooks`. The other Node.js modules and the in-memory disk come with `vitestPluginNext()`: see [Node.js in the browser](nodejs-in-the-browser.md).

## Set up

```ts
// vitest.config.ts
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";
import { vitestPluginRSC } from "vitest-plugin-rsc";

export default defineConfig({
  plugins: [vitestPluginRSC()],
  test: {
    browser: {
      enabled: true,
      provider: playwright(),
      instances: [{ browser: "chromium" }],
    },
    setupFiles: ["./src/vitest.setup.ts"],
  },
});
```

Unlike the Next.js plugin, this one needs a setup file that initializes the renderer and cleans up before each test:

```ts
// src/vitest.setup.ts
import { beforeAll, beforeEach } from "vitest";
import { cleanup, initialize } from "vitest-plugin-rsc/testing-library";

beforeAll(() => {
  initialize();
});

beforeEach(async () => {
  await cleanup();
});
```

## Write a test

```tsx
import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { renderServer } from "vitest-plugin-rsc/testing-library";
import { ServerCounter } from "./server.tsx";

test("server action", async () => {
  await renderServer(<ServerCounter />);

  await page.getByRole("button", { name: "server-counter: 0" }).click();
  await page.getByRole("button", { name: "server-counter: 1" }).click();
  await expect.element(page.getByRole("button", { name: "server-counter: 2" })).toBeVisible();
});
```

This `renderServer` takes `{ container, baseElement, wrapper }` and resolves with `{ container, baseElement, rerender, unmount, asFragment }`. After a Server Action, the tree renders again.

## A static build

`vite build` builds a project page that calls `renderServer()` into a static site, as it does for Next.js. See [Without Next.js](static-build.md#without-nextjs) and the [architecture notes](architecture.md#a-static-build).

## Learn more

- [docs/architecture.md](architecture.md) covers how this works: the two Vite environments and the Module Runner bridge between them.
- `playground/rsc-vitest-demo` is a minimal RSC app without Next.js, and the smallest end-to-end example of the plugin on its own.
