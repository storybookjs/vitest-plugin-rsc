# @storybook/nextjs-vite-rsc

A Storybook framework for Next.js apps with React Server Components, on Vite
and [vitest-plugin-rsc](https://github.com/storybookjs/vitest-plugin-rsc/tree/main/packages/vitest-plugin-rsc).
A story renders the way the app renders: a Server Component in a request of
Next, with `next/headers`, its cookies and Server Actions, and Next's client
hydrates it in the canvas.

> [!WARNING]
> Pre-1.0, on a canary of Storybook 11. The API can change in any release.

## Setup

```sh
pnpm add -D @storybook/nextjs-vite-rsc storybook vitest-plugin-rsc
```

`.storybook/main.ts`:

```ts
import type { StorybookConfig } from "@storybook/nextjs-vite-rsc";

export default {
  stories: ["../app/**/*.stories.tsx"],
  framework: "@storybook/nextjs-vite-rsc",
} satisfies StorybookConfig;
```

The framework brings Storybook's Vite builder, the React renderer and the
plugin. It reads the app's `next.config` and `app/` as the plugin does.

The options of the framework:

```ts
framework: {
  name: "@storybook/nextjs-vite-rsc",
  options: {
    // The options of @storybook/builder-vite.
    builder: { viteConfigPath: ".storybook/vite.config.ts" },
    // The options of vitestPluginNext() of the same names.
    build: "production",
    browserModules: ["msw/**"],
  },
},
```

Storybook uses the project's `vite.config.ts` by default. If that config has
the plugin already, as one for Vitest does, point `builder.viteConfigPath` at
another config: the framework adds the plugin itself, and stops with a
message when it finds it twice.

## Server Stories And Client Stories

Which kind a story is follows from its file, as a component's kind does in
Next.

A story file without `"use client"` is server code. Its stories are server
stories: the component, `render` and the decorators are Server Components,
which can be async and read the request.

```tsx
import type { Meta, StoryObj } from "@storybook/nextjs-vite-rsc";
import { headers } from "next/headers";
import { Greeting } from "./greeting";

const meta = {
  component: Greeting,
  args: { name: "Storybook" },
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
} satisfies Meta<typeof Greeting>;

export default meta;
export const Default: StoryObj<typeof meta> = {};
```

The args of a server story go to the server and back, through Flight, as
props from a Server Component to a Client Component do. A function cannot:
an arg like `fn()` of `storybook/test` fails, with a message that says so.

A story file with `"use client"` is a client boundary. Its stories are
client stories: they render in the browser, as React renders a Client
Component, without Next's app or router. Their args are passed as they are,
so `fn()` is the spy that `play` and the Actions panel read.

```tsx
"use client";

import type { Meta, StoryObj } from "@storybook/nextjs-vite-rsc";
import { expect, fn } from "storybook/test";
import { PressButton } from "./press-button";

const meta = {
  component: PressButton,
  args: { onPress: fn() },
} satisfies Meta<typeof PressButton>;

export default meta;

export const Pressed: StoryObj<typeof meta> = {
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button"));
    await expect(args.onPress).toHaveBeenCalled();
  },
};
```

What the file imports is client code too, so a client story cannot render a
Server Component or call `next/headers`.

A server story without `component` and `render` is the page of the app at
its URL:

```ts
export default { title: "Pages/Notes" };
export const Notes = { parameters: { nextjs: { url: "/notes" } } };
```

## `parameters.nextjs`

The request a server story renders in:

- `url`: the URL of the request, which `usePathname()`, `useParams()` and
  `useSearchParams()` read. Defaults to `/`. A page story needs one.
- `headers`: headers of the requests to the app, next to the browser's,
  like `cookie`.
- `proxy`: whether `proxy.ts` and the routing of `next.config` take the
  request. Defaults to `true` for a page, `false` for a component.
- `layouts`: renders the story in place of the page at `url`, in the
  layouts of the app, which then own the document. Defaults to `false`.

A new value of an arg, from the Controls panel, renders the story again in
a new request.

## The Preview File

`.storybook/preview.tsx` has no directive, so it is a module that both
sides import, as a shared module is in Next. The framework evaluates it
twice: on the server, where its decorators decorate the server stories, and
in the browser, where they decorate the client stories. A decorator of the
preview file, like a provider of the app's theme, so applies to every story.

So the preview file, and what it imports, has to load in a browser too.
Setup that is only for the server, like a database, goes in a decorator of
the server stories, in their story file or a file that they import. When
the preview file fails to load in the browser, a client story shows an
error that says so.

The CSS that the preview file and a story file import is the story's, in
both kinds of story.

## Not In This Version

- Docs pages and MDX.
- A new value of an arg renders the story again in place, with the state it
  has: now it is a new request.
- Hot reload of a module that a client story imports, without a reload of
  the preview.
- Next's router in a client story: `useRouter()` throws there, and
  `usePathname()` returns `null`. A server story has the router.
