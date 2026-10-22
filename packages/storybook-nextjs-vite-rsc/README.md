# @storybook/nextjs-vite-rsc

A Storybook framework for Next.js apps with React Server Components, built on Vite and [vitest-plugin-rsc](https://github.com/storybookjs/vitest-plugin-rsc/tree/main/packages/vitest-plugin-rsc).

Your stories render the way your app does: a Server Component renders in a real Next request, with `next/headers`, cookies and Server Actions, and Next's client hydrates it in the canvas. A story can even be a whole page of your app.

> [!WARNING]
> Pre-1.0, on a canary of Storybook 11. The API can change in any release.

## Setup

```sh
pnpm add -D @storybook/nextjs-vite-rsc storybook vite vitest-plugin-rsc
```

```ts
// .storybook/main.ts
import type { StorybookConfig } from "@storybook/nextjs-vite-rsc";

export default {
  stories: ["../app/**/*.stories.tsx"],
  framework: "@storybook/nextjs-vite-rsc",
} satisfies StorybookConfig;
```

That's it. The framework brings Storybook's Vite builder, the React renderer and the plugin, and reads your `next.config` and `app/` itself.

### Options

```ts
framework: {
  name: "@storybook/nextjs-vite-rsc",
  options: {
    // Options for @storybook/builder-vite.
    builder: { viteConfigPath: ".storybook/vite.config.ts" },
    // Same as the vitestPluginNext() options of the same name.
    build: "production",
    // Globs from the root. Start a package's pattern with `**`.
    browserModules: ["**/node_modules/msw/**"],
  },
},
```

Storybook uses your project's `vite.config.ts` by default. If that already includes the plugin (as a Vitest config would), point `builder.viteConfigPath` at another config. The framework adds the plugin itself, and tells you if it finds it twice.

## Server stories and client stories

It works the same as with the plugin's test files:

- A story file **without** `"use client"` is server code. Its stories are **server stories**: the component, `render` and decorators are Server Components, which can be async and read the request.
- A story file **with** `"use client"` is a client boundary. Its stories are **client stories**: plain `@storybook/react` stories that render in the browser, without Next's router.

A server story:

```tsx
import preview from "../.storybook/preview.server";
import { Greeting } from "./greeting";

const meta = preview.meta({
  component: Greeting,
  args: { name: "Storybook" },
});

export const Default = meta.story({});
```

Its args go to the server and back through Flight, just like props from a Server Component to a Client Component. So a function arg that reaches a Client Component fails with React's usual error. Changing an arg in Controls re-renders the story in place, and its Client Components keep their state.

A client story:

```tsx
"use client";

import { expect, fn } from "storybook/test";
import preview from "../.storybook/preview";
import { PressButton } from "./press-button";

const meta = preview.meta({
  component: PressButton,
  args: { onPress: fn() },
});

export const Pressed = meta.story({
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button"));
    await expect(args.onPress).toHaveBeenCalled();
  },
});
```

Args are passed as they are, so `fn()` is the spy that `play` and the Actions panel see. Everything a client story file imports is client code, so it can't render a Server Component or call `next/headers`.

A few more things about client stories:

- `fetch`, cookies and storage are the browser's own, like in `@storybook/react`. `fetch` goes to the network, where MSW can catch it.
- In Storybook's UI, a link opens in the manager window, as for any story. Where a link would replace the preview (say, Next's `<Link>` with no router around), the preview stays put and the URL shows up in the Actions panel as `navigation`.
- No Next router: `useRouter()` throws and `usePathname()` returns `null`. Use a server story for that.

## Two previews

Stories use CSF Next: a story file imports a preview and builds its stories with `preview.meta()` and `meta.story()`. Since there are two kinds of stories, there are two previews.

**`.storybook/preview.tsx`** starts with `"use client"`. It's your project's normal preview, used for client stories and docs pages:

```tsx
"use client";

import { definePreview } from "@storybook/nextjs-vite-rsc";
import docs from "@storybook/addon-docs";
import { ThemeProvider } from "../app/theme";

export default definePreview({
  addons: [docs()],
  decorators: [
    (Story) => (
      <ThemeProvider>
        <Story />
      </ThemeProvider>
    ),
  ],
});
```

**`.storybook/preview.server.tsx`** has no directive: it's server code, like a route. Use it for server stories:

```tsx
import { defineServerPreview } from "@storybook/nextjs-vite-rsc/server";
import { headers } from "next/headers";
import { db } from "../app/db";

export default defineServerPreview({
  decorators: [
    async (Story) => {
      const agent = (await headers()).get("user-agent");
      return (
        <div data-agent={agent}>
          <Story />
        </div>
      );
    },
  ],
  beforeEach: () => db.seed(),
});
```

Each story file imports the preview of its own kind. Get it wrong and you'll get a message saying so. (One exception: a server story file that imports `preview.tsx` fails with `preview.meta is not a function`. Add `.server` to the import.)

Storybook reads some settings from `preview.tsx` only. So in the server preview:

- **Use `beforeEach`, not `beforeAll`.** `beforeAll` never runs there, and `defineServerPreview()` tells you so. Seed in `beforeEach` rather than in a loader, too: the first render's loaders run before the app's browser context opens.
- **Declare globals in `preview.tsx`.** Server stories can still read them from `context.globals`.
- **Put tags in `preview.tsx`** or the story files. Tags in the server preview don't reach the sidebar, autodocs or test filtering.
- **Put `sb.mock()` in `preview.tsx`.** It mocks the module in every layer, server code included. In `preview.server.tsx` it does nothing.

## Pages

A server story without `component` or `render` is the page of your app at its URL, inside its layouts:

```ts
const meta = preview.meta({ title: "Pages/Notes" });

export const Notes = meta.story({
  parameters: { nextjs: { url: "/notes" } },
});
```

A page has no props, so its `args` feed the story's `beforeEach` instead. That way a control can seed the data the page reads. A new value means a new page load.

```ts
export const Notes = meta.type<{ args: { count: number } }>().story({
  parameters: { nextjs: { url: "/notes" } },
  args: { count: 3 },
  beforeEach: ({ args }) => seedNotes(args.count),
});
```

Good to know about pages:

- The page owns the document (Storybook's `layout: "document"`). In `play`, `canvasElement` is its `<body>`, and `canvas` queries it fresh each time, even after the page renders a whole new document.
- Decorators don't apply, since there's no node to decorate. Storybook's backgrounds, measure and outline do nothing on a page either.
- The page has only your app's CSS. No CSS from the preview or the story file, and `parameters.layout` doesn't style it.
- `mount(ui)` has nothing to replace on a page, and fails with a message.

## Before each story

Before every server story, the framework leaves the previous page and opens a fresh browser context for your app, with empty cookies and storage, just like before a test. Then it runs the `beforeEach` of the server preview and of the story. Whatever those set up is there for the render: database rows, cookies, `localStorage` items.

```ts
export const SignedIn = meta.story({
  beforeEach: async () => {
    await runInServerAction(async () => {
      (await cookies()).set("session", "ada");
    });
  },
});
```

(`runInServerAction` comes from `vitest-plugin-rsc/nextjs/testing-library`.)

The page's cookies and storage are its own. Storybook's items in the browser's storage are invisible to your app, and vice versa. Your browser's DevTools show the browser's storage, not the page's.

## `parameters.nextjs`

The request a server story renders in:

| Parameter | What it does                                                                                                                                                                |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `url`     | The request URL, which `usePathname()`, `useParams()` and `useSearchParams()` read. Defaults to `/`. Page stories need one.                                                 |
| `headers` | Extra request headers, like `cookie`.                                                                                                                                       |
| `proxy`   | Whether `proxy.ts` and the `next.config` routing handle the request. Defaults to `true` for a page, `false` for a component.                                                |
| `layouts` | Renders the component in place of the page at `url`, inside your layouts. Defaults to `false`. Set it in `preview.server.tsx` to put every component story in your layouts. |

## Environment variables

A story's server code reads `process.env` like your tests do:

- `storybook dev` reads `.env.test.local`, `.env.test` and `.env`.
- `storybook build` reads `.env.test` and `.env`.

It never reads `.env.local` or `.env.development` (Storybook loads those into its own Node process), or your shell, unless `env` in `next.config` puts a value in. `NEXT_PUBLIC_` variables and `next.config` `env` are available before your preview runs.

> [!WARNING]
> `storybook build` bakes these values into the static site, which Chromatic publishes. Keep secrets out of `.env.test` and `.env`. A secret you only need locally goes in `.env.test.local`.

Only have values in `.env.development`, for `next dev`? Move them to `.env` or `.env.test` (or `.env.test.local` for just your machine). `import.meta.env.STORYBOOK_*` still comes from Storybook's own env files. More in [Environment Variables](https://github.com/storybookjs/vitest-plugin-rsc/blob/main/docs/internals/next-routes.md#environment-variables).

## Addons

List an addon in `main.ts` for its panel, and import it in a preview to use it, like `addons: [a11y()]`.

Which preview? An addon whose preview doesn't render React works for server stories: hooks like `beforeEach`, loaders, and decorators that work on the DOM. a11y is like that, and so are Storybook's backgrounds, outline, measure and viewport. Import those in `preview.server.tsx` too. An addon whose decorator renders a component belongs in `preview.tsx`, for client stories.

Some details:

- Storybook's preview runtime and its addons are one shared instance across both previews. So a client story's `fn()` is the spy the Actions panel shows.
- A package that depends on React (like `@storybook/addon-docs` or `storybook/theming`) gets one copy per layer, just like React itself.
- An addon imported in `preview.server.tsx` is server code, so `typeof window` is `"undefined"` there. If its preview checks for the browser that way, it silently does nothing for server stories. Name it in `browserModules`, like `["**/node_modules/@storybook/addon-x/**"]`, to fix that.

## After a change

- Changing a story file, `preview.server.tsx`, or a component that only stories import re-renders the story in place.
- Changing `preview.tsx` re-renders it after Storybook reloads the preview.
- Changing code that a route of your app imports reloads the preview.
- Changing a stylesheet that a preview imports updates in place.

## Docs

`@storybook/addon-docs` is an optional peer dependency. Install it next to `storybook`, at the same version:

```sh
npm install --save-dev @storybook/addon-docs
```

```ts
export default {
  stories: ["../app/**/*.mdx", "../app/**/*.stories.tsx"],
  addons: ["@storybook/addon-docs"],
  framework: "@storybook/nextjs-vite-rsc",
} satisfies StorybookConfig;
```

On a docs page:

- **Client stories render inline.** Controls update them in place.
- **Server stories render in an iframe**, since each one is a page of your app with its own document. A story that owns the document is 667px tall (a small phone), a component 100px. The iframe doesn't grow with its content, so set `parameters.docs.story.height` if you need more room.
- **Each iframe has its own cookies and storage**, starting empty.
- **`inline: true` doesn't work** for a server story, and shows an error saying so.
- **Play functions don't run** on a docs page, unless you ask with `autoplay`. Server stories on one docs page share the window's focus and URL, so a play that types or navigates can fail there. Open the story to play it.

MDX files are compiled as `"use client"` files, and so is everything they import. So an MDX file can import client story files (for `of={…}`), but not server story files or server-only code. Refer to a server story by its id:

```mdx
import { Canvas, Meta } from "@storybook/addon-docs/blocks";
import * as PressButton from "./press-button.stories";

<Meta title="Introduction" />

<Canvas id="greeting--default" />

<Canvas of={PressButton.Pressed} />
```

`Source` shows Storybook's docgen snippet or the story's source. A server story renders on the server, so there's no snippet of what it rendered. The args table works for both kinds.

## Vitest

Storybook's Vitest addon runs every story as a test, in Vitest's Browser Mode, and from Storybook's UI. Server stories render in a page of your app, client stories in the browser, each with its own preview.

```sh
pnpm add -D @storybook/addon-vitest vitest @vitest/browser-playwright
```

Add `@storybook/addon-vitest` to `addons` in `.storybook/main.ts`, and add a project to your Vitest config:

```ts
import { storybookTest } from "@storybook/addon-vitest/vitest-plugin";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [storybookTest()],
  test: {
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: "chromium" }],
    },
  },
});
```

No `vitestPluginRSC()` needed here: the framework brings it.

### Running a story in a test

You can also import a story into a test and run it with `run()`. CSF Next already knows the story's preview, so there's no `setProjectAnnotations()`. The story renders and plays, and then your test can check more:

```tsx
import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { WithNotes } from "./page.stories";

test("the notes page", async () => {
  await WithNotes.run();
  await expect.element(page.getByRole("link", { name: "New note" })).toBeVisible();
});
```

Run server stories from a test file without `"use client"`, and client stories from one with it, in a project with the plugin.

One catch: `sb.mock()` from `preview.tsx` mocks nothing in such a test. Name the module by its path, `sb.mock("../lib/db.ts")`, and mock it with `vi.mock()` in a setup file of the test project as well.

## Not in this version

- Controls on a docs page don't reach a server story, since it lives in an iframe. Open the story to change its args.
- Tags in `preview.server.tsx` (see [Two previews](#two-previews)).
- Changing an MDX file that shows a client story with `of={…}` breaks that block until the preview reloads.
- Next's router in a client story.
- A docs page has the CSS of the client stories it shows inline, but not the MDX file's own CSS, or `preview.tsx`'s CSS on a page without a client story.
