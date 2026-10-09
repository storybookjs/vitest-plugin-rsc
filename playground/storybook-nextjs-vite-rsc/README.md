# @storybook/nextjs-vite-rsc

A Storybook framework for Next.js with React Server Components. It runs your app the way [vitest-plugin-rsc](../../README.md) runs it in a test: the Next.js server runs in the browser, and every story is a real request to your app. Server Components, `headers()`, `cookies()`, Server Actions, `proxy.ts`, Next's router and caching all work as they do in the app.

It is developed here, next to the plugin, and is meant to move into the Storybook monorepo next to `@storybook/nextjs-vite`.

## Set Up

```ts
// .storybook/main.ts
import { defineMain } from "@storybook/nextjs-vite-rsc/node";

export default defineMain({
  stories: ["../app/**/*.stories.tsx", "../components/**/*.stories.tsx"],
  addons: ["@storybook/addon-docs"],
  framework: {
    name: "@storybook/nextjs-vite-rsc",
    options: {
      // A `vite.config.ts` of the project for Vitest would add the plugin a
      // second time: point Storybook at a config of its own, or at none.
      builder: { viteConfigPath: ".storybook/vite.config.ts" },
      // Modules of the preview that have to know they run in a browser, like
      // MSW: see `browserModules` of vitest-plugin-rsc.
      browserModules: ["**/node_modules/msw/**", "**/node_modules/@mswjs/**"],
    },
  },
});
```

```ts
// .storybook/preview.ts
import addonDocs from "@storybook/addon-docs";
import { definePreview } from "@storybook/nextjs-vite-rsc";
import "../app/globals.css";

export default definePreview({ addons: [addonDocs()] });
```

The examples import `.storybook/preview.ts` as `#.storybook/preview.ts`, with `"imports": { "#*": "./*" }` in `package.json`. A relative path works as well.

A story has the CSS of what `.storybook/preview` and its own story file import, as Next links it, in dev and in a static build: not the CSS of another story file.

## Three Kinds Of Story

A story file is server code, as a file of your app is. The directive at the top decides where its stories render.

| Kind                   | Story file                                   | Renders                                                                                                                               |
| ---------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| A story of a component | no directive                                 | The component and `render` are Server Components, which can be `async`. They render on a route of their own, in a request of the app. |
| A client story         | `"use client"`                               | In the browser, as a Client Component. An arg can be a function, like a spy of `storybook/test`, and `render` can have state.         |
| A page                 | no directive, no `component` and no `render` | The route of the app at `parameters.nextjs.url`, in its layouts, as a browser opens it.                                               |

```tsx
// app/notes/page.stories.tsx: a page of the app
import { expect, userEvent } from "storybook/test";
import preview from "#.storybook/preview.ts";

const meta = preview.meta({
  title: "Pages/Notes",
  parameters: { layout: "fullscreen", nextjs: { url: "/notes" } },
});

export const Empty = meta.story({
  async play({ canvas }) {
    await expect(await canvas.findByText("No notes yet")).toBeVisible();
  },
});

Empty.test("links to the form for a new note", async ({ canvas }) => {
  await userEvent.click(canvas.getByRole("link", { name: "Create your first note" }));
  await expect(await canvas.findByRole("heading", { level: 1, name: "New note" })).toBeVisible();
});
```

```tsx
// components/submit-button.stories.tsx: a client story
"use client";

import { expect, fn, userEvent, waitFor } from "storybook/test";
import preview from "#.storybook/preview.ts";
import { SubmitButton } from "./submit-button.tsx";

// `preview.type()` adds an arg that the render function takes.
const meta = preview.type<{ args: { onSave: () => void } }>().meta({
  component: SubmitButton,
  args: { children: "Save note", onSave: fn() },
  render: ({ onSave, ...args }) => (
    <form action={async () => onSave()}>
      <SubmitButton {...args} />
    </form>
  ),
});

export const Pending = meta.story({
  async play({ args, canvas }) {
    await userEvent.click(await canvas.findByRole("button", { name: "Save note" }));
    await waitFor(() => expect(args.onSave).toHaveBeenCalledOnce());
  },
});
```

A story seeds what its page reads in `beforeEach`, as a test does, and mocks modules with `sb.mock()` in `.storybook/preview.ts`. The preview is the server's own module graph, so a database or a session that a story sets up is the one the Server Components read. `sb.mock()` mocks the modules of that graph, the rsc layer: what Server Components, Server Actions and route handlers import. It takes a relative path: Storybook resolves the path from its own package, which does not know the `imports` of yours.

The decorators of `definePreview()` are Server Components around every story, also around a client story. The decorators of a client story and of its meta render in the browser, inside them.

## Parameters

`parameters.nextjs` is the request a story renders in:

| Parameter | What it does                                                                                                                                                         | Default                                               |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `url`     | The URL of the request. A page story opens the route at this URL. For a story of a component it is what `usePathname()`, `useParams()` and `useSearchParams()` read. | `/`                                                   |
| `headers` | Headers of the request, next to the ones a browser sends, like `cookie`.                                                                                             | none                                                  |
| `layouts` | For a story of a component: renders it in place of the page at `url`, inside the app's layouts.                                                                      | `false`                                               |
| `proxy`   | Runs `proxy.ts` and the redirects, rewrites and headers of `next.config` for the request.                                                                            | `true` for a page, `false` for a story of a component |

The framework says so when a story is used wrong, with what to do instead: a hook in the `render` of a story without `"use client"`, a page story without `url`, `layouts` on a page story, or a page story in a file with `"use client"`.

## Docs

Autodocs and MDX docs pages work with `@storybook/addon-docs`. A docs page renders with React DOM, so it is code of the browser layer, as a client story is: it renders in a module graph of its own that lives as long as the document. Every story on a docs page renders in an iframe of its own (`docs.story.inline` is `false`), since the app runs once per document.

## Static Build

`storybook build` builds the three layers of the app with Vite's app builder. That needs `features.viteAppBuilder` of `@storybook/builder-vite` (storybookjs/storybook#36690), which the framework turns on. Until a release of Storybook has it, this repository patches `@storybook/builder-vite`.

## Portable Stories

`composeStories()`, `composeStory()` and `setProjectAnnotations()` compose a story of CSF 3 with the annotations of the framework, as `@storybook/addon-vitest` does to run stories as tests. A story of CSF Next has `Story.run()`. Running them in Vitest also needs the framework's Vite setup there, which is not done yet.

## Moving Into The Storybook Monorepo

The package is laid out as a framework of the monorepo: `.` has `definePreview()`, the types and portable stories, `./node` has `defineMain()`, `./preset` the Vite wiring, `./entry-preview` the annotations of the renderer and `./preview` CSF Next. It is its own renderer too. What a move has to keep:

- `src/client-story.tsx` (`"use client"`) and `src/docs/docs-renderer.tsx` are modules of the browser layer, which the plugin loads by their path: they stay files of their own, not chunks of a bundle.
- The runtime mechanisms are vitest-plugin-rsc's: its public API, and `vitest-plugin-rsc/nextjs/internal`.
- The registrations of a framework: `frameworkPackages`, `frameworkToRenderer`, the CLI templates and the build config.

## Not Yet

- Controls and argTypes inferred from the props of a component.
- Stories inline on a docs page: each one renders in an iframe.
- `parameters.docs.components` from a story file without `"use client"`.
- A preview in CSF 3, without `definePreview()`: it works, but its decorators do not wrap a client story.
- `@storybook/addon-vitest`, which runs stories as Vitest tests.
- An error of a component or of a decorator that the server renders shows the error page of Next in the canvas. An error of a story's own `render` shows in Storybook.
