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

## Pages

A server story without `component` and `render` is the page of the app at
its URL, in its layouts:

```ts
export default { title: "Pages/Notes" };
export const Notes = { parameters: { nextjs: { url: "/notes" } } };
```

A page has no props. Its `args` are inputs of the story's `beforeEach`,
which runs before the request, so a control can seed the data the page
reads. A new value is a new page load.

```ts
export const Notes = {
  parameters: { nextjs: { url: "/notes" } },
  args: { count: 3 },
  beforeEach: ({ args }) => seedNotes(args.count),
};
```

The page owns the document. In `play`, `canvas` and `canvasElement` are
its `<body>`: query with `canvas`, not `screen` of `storybook/test`, which
queries the `<body>` of Storybook that the page replaced. A `<Link>`, a
Server Action and `redirect()` keep that `<body>`. After a navigation that
loads a new document, query `within(document.body)`.

A page renders without the decorators, which have no node to decorate,
Storybook's own included: backgrounds, measure and outline do nothing on a
page. It has no CSS of the preview file or its story file, and
`parameters.layout` does not style it: the app styles its own `<body>`.
`layouts` is for a component, and `mount(ui)` has no story to replace: both
fail with a message.

## Before A Story

Before each story the framework leaves the previous one and clears the
app's cookies and storage, as before a test, and then runs the story's
`beforeEach`. What that sets is there for the render: a cookie of the app,
set in `runInServerAction()` of `vitest-plugin-rsc/nextjs/testing-library`,
or an item of `localStorage`.

```ts
export const SignedIn = {
  beforeEach: async () => {
    await runInServerAction(async () => {
      (await cookies()).set("session", "ada");
    });
  },
};
```

## `parameters.nextjs`

The request a server story renders in:

- `url`: the URL of the request, which `usePathname()`, `useParams()` and
  `useSearchParams()` read. Defaults to `/`. A page story needs one.
- `headers`: headers of the requests to the app, next to the browser's,
  like `cookie`.
- `proxy`: whether `proxy.ts` and the routing of `next.config` take the
  request. Defaults to `true` for a page, `false` for a component.
- `layouts`: renders the component in place of the page at `url`, in the
  layouts of the app, which then own the document, as a page does. Not for
  a page. Defaults to `false`.

A new value of an arg, from the Controls panel, renders the story again in
a new request.

## The Preview File

`.storybook/preview.tsx` has no directive, so it is server code, as a
layout of the app is in Next. The framework evaluates it once, on the
server, for both kinds of story, so it can import server code, like
`server-only` or a database, and set it up in `beforeEach` or a loader.

A decorator of the preview file decorates every story. It is a synchronous
function that returns elements: a server story renders them in its
request, and a client story in the browser, where a Client Component among
them, like the provider of the app's theme, renders as it would in a page.
What has state or context is such a component, of a file with
`"use client"`, which the decorator renders:

```tsx
import type { Preview } from "@storybook/nextjs-vite-rsc";
import { ThemeProvider } from "../app/theme"; // "use client"

export default {
  decorators: [
    (Story) => (
      <ThemeProvider theme="light">
        <Story />
      </ThemeProvider>
    ),
  ],
} satisfies Preview;
```

For a client story a decorator cannot be async, read the request, like
`cookies()`, or call a hook of React: the story shows an error that says
so. A server story has such a decorator in the meta of its story file, or
in the preview file, as long as no client story renders it. Storybook's
hooks, like `useArgs()` and `useGlobals()`, work in every decorator. A
component of a file with `"use client"` is not a decorator itself: the
preview file has it as a reference, which renders as an element.

The CSS that the preview file and a story file import is the story's, in
both kinds of story.

## After A Change

A change of a story file renders its stories again in place. A change of
the code of the app, or of the preview file, loads the preview again: the
server code of the app runs once per document. A change of a stylesheet
that the preview file imports shows in place.

## Docs

With `@storybook/addon-docs` a story file can have a docs page, with
`tags: ["autodocs"]`, and an MDX file is a docs page of its own. The
framework has addon-docs as an optional peer dependency: install it next to
`storybook`, in the same version, so the docs page and the blocks of the
MDX files are one copy.

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

A docs page renders in the browser, as a Client Component does. It shows
each story the way its kind renders:

- A client story renders in the docs page, inline. A new value from
  Controls renders it again in place, with the state it has.
- A server story renders in a page of the app, which has a document of its
  own: the docs page shows it in Storybook's iframe of the story, 320px
  high. Set another height with `parameters.docs.story.iframeHeight`.

`parameters.docs.story.inline`, or `<Canvas story={{ inline }} />`,
decides it when a story or a block sets it. A client story with
`inline: false` renders in an iframe. A server story with `inline: true`
cannot render in the docs page, and shows an error that says so.

An MDX file is client code, as a file with `"use client"` is, and so is
what it imports, with one exception: its imports of story files are the
stories of Storybook, for `of={…}`, so a server story file is fine there.
Code that is only for the server, like `server-only` or a database, cannot
be imported at the top of an MDX file: the docs page fails with an error
that says so. Show server code through a story, with
`<Canvas of={Stories.Name} />`.

```mdx
import { Canvas, Meta } from "@storybook/addon-docs/blocks";
import * as Greeting from "./greeting.stories";

<Meta of={Greeting} />

<Canvas of={Greeting.Default} />
```

Chromatic and other tools that read the stories of a build with
`extract()` load every file of the index, the MDX files too. One MDX file
that fails to load fails all of it, while `storybook build` succeeds.

The docs page, its blocks and Storybook's theming render with React DOM,
in the browser, and the preview file is evaluated on the server (see The
Preview File), as a story file without `"use client"` is. So neither
can import `@storybook/addon-docs/blocks` or `storybook/theming`, which
stops with a message: import them from a file with `"use client"`, like a
`docs.page` made of blocks. A theme comes from `storybook/theming/create`:

```ts
import { themes } from "storybook/theming/create";

export default {
  parameters: { docs: { theme: themes.dark } },
} satisfies Preview;
```

A component of `parameters.docs`, like `container`, `page` or one of
`components`, renders in the browser: one of a file with `"use client"`,
which the preview file or a server story file has as a reference, renders
there as it would in a page.

The framework sets `parameters.docs.renderer`, which renders the docs page
in the browser: one of the project's own is not supported.

`Source` shows the snippet of Storybook's docgen, or the source of the
story: a server story renders on the server, so there is no snippet of
what it rendered. The args table reads the files with Storybook's docgen,
for both kinds.

## Not In This Version

- Controls on a docs page do not reach a server story, which is in an
  iframe, as they reach no story in an iframe in Storybook: open the story
  to change its args.
- The iframe of a server story on a docs page does not follow the height
  of its page.
- One instance of a package for an addon and a client story: an addon
  that a client story needs the same module of, beyond `storybook/test`
  and Storybook's own modules of the preview, gets one of each.
- `definePreview()` and the story factories of CSF Next: write the preview
  file and the stories in CSF 3, as above. A story file with `"use client"`
  that imports the preview file shows an error that says so: the preview
  file is server code.
- A decorator of an addon that renders a component of the addon, like a
  provider of `@storybook/addon-themes`. One that returns `Story()` applies
  to both kinds of story.
- A new value of an arg renders the story again in place, with the state it
  has: now it is a new request.
- A change of a component that only client stories, or the decorators of
  the preview file, render and no route imports: it shows once the preview
  loads again.
- Next's router in a client story: `useRouter()` throws there, and
  `usePathname()` returns `null`. A server story has the router.
