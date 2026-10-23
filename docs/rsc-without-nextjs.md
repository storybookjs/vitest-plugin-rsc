# RSC without Next.js

Not using Next? `vitestPluginRSC()` on its own renders Server Components for any React app. It's simpler: no request, no router. `renderServer` renders a node to a Flight stream and reads it right back, in the same test.

> [!NOTE]
> On its own, the plugin only provides `node:async_hooks`. The other Node.js modules and the in-memory disk come with `vitestPluginNext()`. See [Node.js in the browser](nodejs-in-the-browser.md).

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

Unlike the Next.js plugin, this one needs a setup file to start the renderer and clean up between tests:

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

`vite build` can turn a page that calls `renderServer()` into a static site, just like with Next.js. See [Without Next.js](static-build.md#without-nextjs).

## Learn more

- [Architecture](internals/architecture.md): the two Vite environments, and the bridge between them.
- `playground/rsc-vitest-demo`: the smallest complete example.
