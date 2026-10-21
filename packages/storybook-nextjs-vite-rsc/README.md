# @storybook/nextjs-vite-rsc

A Storybook framework for Next.js apps with React Server Components, on Vite
and [vitest-plugin-rsc](https://github.com/storybookjs/vitest-plugin-rsc/tree/main/packages/vitest-plugin-rsc).
A story renders the way the app renders: a Server Component in a request of
Next, with `next/headers`, its cookies and Server Actions, and Next's client
hydrates it in the canvas.

> [!WARNING]
> Pre-1.0, on a canary of Storybook 11. The API can change in any release.

Storybook is a host of the plugin, as Vitest is. The preview is the rsc
layer, where Storybook's runtime and store run, and a story file is what a
test file is: one without `"use client"` is server code, one with it runs
in the browser layer, as React renders a Client Component.

## Setup

```sh
pnpm add -D @storybook/nextjs-vite-rsc storybook vite vitest-plugin-rsc
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
    // Glob patterns from the root; one for a package starts
    // with `**`, as it matches the package's real path.
    browserModules: ["**/node_modules/msw/**"],
  },
},
```

Storybook uses the project's `vite.config.ts` by default. If that config has
the plugin already, as one for Vitest does, point `builder.viteConfigPath` at
another config: the framework adds the plugin itself, and stops with a
message when it finds it twice.

## Two Previews

Stories are CSF Next: a story file imports a preview and writes its stories
with `preview.meta()` and `meta.story()`. There is a preview for each layer,
and a story renders with the preview its file imports.

`.storybook/preview.tsx` starts with `"use client"`. It is the project's
preview of Storybook, for the client stories and the docs pages, made with
`definePreview()` of `@storybook/nextjs-vite-rsc`, which is the one of
`@storybook/react`:

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

`.storybook/preview.server.tsx` has no directive: it is server code, as a
route of the app is. It is made with `defineServerPreview()` of
`@storybook/nextjs-vite-rsc/server`, for the server stories:

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

Storybook reads some of a preview from the project's preview only, which is
`preview.tsx`. So in the server preview:

- `beforeAll` never runs: use `beforeEach` or loaders, which run before each
  server story. `defineServerPreview()` stops with a message.
- Globals are declared in `preview.tsx`. A key of `globalTypes` or
  `initialGlobals` that only the server preview has fails its story files
  with a message. Server stories read the globals from `context.globals`,
  as client stories do.
- Tags do not reach the index: the sidebar, autodocs and test filtering read
  the tags of `preview.tsx` and of the story files. Set tags there.
- `sb.mock()` calls are read from `preview.tsx` only, and mock the module in
  every layer: put them there, also for a module of server code that a
  server story renders. In `preview.server.tsx` they mock nothing.

A story file imports the preview of its own layer: one with `"use client"`
imports `preview.tsx`, one without imports `preview.server.tsx`. A file with
`"use client"` that imports `preview.server.tsx`, or a file that is not CSF
Next, fails to load with a message that says which. A file without
`"use client"` that imports `preview.tsx` gets its client reference, as any
server code does, and fails while it loads with
`preview.meta is not a function`: add `.server` to the import.

## Server Stories And Client Stories

A story file without `"use client"` is server code. Its stories are server
stories: the component, `render` and the decorators are Server Components,
which can be async and read the request.

```tsx
import preview from "../.storybook/preview.server";
import { Greeting } from "./greeting";

const meta = preview.meta({
  component: Greeting,
  args: { name: "Storybook" },
});

export const Default = meta.story({});
```

The args of a server story go to the server and back, through Flight, as
props from a Server Component to a Client Component do. A function that
reaches a Client Component fails with React's own error. A new value of an
arg, from Controls, renders the story again in place: its Client
Components keep their state.

A story file with `"use client"` is a client boundary. Its stories are
client stories of `@storybook/react`: they render in the browser, as React
renders a Client Component, without Next's app or router. Their args are
passed as they are, so `fn()` is the spy that `play` and the Actions panel
read.

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

What the file imports is client code too, so a client story cannot render a
Server Component or call `next/headers`.

A story has the CSS of its file, with what the file imports, its preview's
too, whatever story Storybook showed before it: a client story while
Storybook shows it, a server story in the request of its page. A page has
the CSS of its route alone, as with `next start`.

## Pages

A server story without `component` and `render` is the page of the app at
its URL, in its layouts:

```ts
const meta = preview.meta({ title: "Pages/Notes" });

export const Notes = meta.story({
  parameters: { nextjs: { url: "/notes" } },
});
```

A page has no props. Its `args` are inputs of the story's `beforeEach`,
which runs before the request, so a control can seed the data the page
reads. A new value is a new page load.

```ts
export const Notes = meta.type<{ args: { count: number } }>().story({
  parameters: { nextjs: { url: "/notes" } },
  args: { count: 3 },
  beforeEach: ({ args }) => seedNotes(args.count),
});
```

The page owns the document: the factory gives it Storybook's
`layout: "document"`, as it does a component in the app's layouts. Its root
is the `<body>` the page leaves, which Storybook marks `#storybook-root`
after each render. In `play`, `canvasElement` is that `<body>`, and `canvas`
queries the document's `<body>` at each query, also after the page renders
its document anew, as Next's not-found page does.

While the page loads, Storybook's preparing block stays over the preview,
as for any story; it goes once the page rendered, with its stylesheets.

A page renders without the decorators, which have no node to decorate,
Storybook's own included: backgrounds, measure and outline do nothing on a
page. It has no CSS of the preview or its story file, and
`parameters.layout` does not style it: the app styles its own `<body>`.
A page is in its layouts whatever `layouts` says. `mount(ui)` has no story
to replace on a page, and fails with a message.

## Environment Variables

A story's server code reads `process.env` as the app's tests do: from the
project's test env, Next's env files of its test mode. `storybook dev`
reads `.env.test.local`, `.env.test` and `.env`, `storybook build` reads
`.env.test` and `.env`, and no `.local` file. Never `.env.local` or
`.env.development`, which Storybook loads into its own Node process, and
no value of the shell, unless `env` of `next.config` puts it in.
`NEXT_PUBLIC_` variables and `env` of `next.config` are in `process.env`
too, before the first module of `preview.tsx` runs.

`storybook build` puts the values into the static site, which Chromatic
publishes: keep secrets out of `.env.test` and `.env`. A secret that the
stories need on your machine goes in `.env.test.local`. The build says the
files and the names it puts in, never their values.

An app that has its values only in `.env.development`, for `next dev`,
moves them to `.env`, to `.env.test`, or for one machine to
`.env.test.local`. `import.meta.env.STORYBOOK_*` still comes from
Storybook's own env files. See
[Environment Variables](https://github.com/storybookjs/vitest-plugin-rsc/blob/main/docs/next-routes.md#environment-variables).

## Before A Story

Before each server story the framework leaves the previous page and clears
the app's cookies and storage, as before a test, and then runs the
`beforeEach` of the server preview and of the story. What that sets is
there for the render: a row of the app's database, a cookie of the app, set
in `runInServerAction()` of `vitest-plugin-rsc/nextjs/testing-library`, or
an item of `localStorage`.

```ts
export const SignedIn = meta.story({
  beforeEach: async () => {
    await runInServerAction(async () => {
      (await cookies()).set("session", "ada");
    });
  },
});
```

The page's `localStorage` and `sessionStorage` are its own, as its cookies
are: Storybook's items in the browser's storage are invisible to the app,
and what the app stores does not reach them. The browser's DevTools show
the browser's storage, not the page's.

## `parameters.nextjs`

The request a server story renders in:

- `url`: the URL of the request, which `usePathname()`, `useParams()` and
  `useSearchParams()` read. Defaults to `/`. A page story needs one.
- `headers`: headers of the requests to the app, next to the browser's,
  like `cookie`.
- `proxy`: whether `proxy.ts` and the routing of `next.config` take the
  request. Defaults to `true` for a page, `false` for a component.
- `layouts`: renders the component in place of the page at `url`, in the
  layouts of the app, which then own the document, as a page does. Defaults
  to `false`. A page is in its layouts whatever it says, so `layouts: true`
  in `preview.server.tsx` puts every component story in them.

## Addons

An addon is listed in `main.ts`, for its panel, and a preview imports it to
use it, as `addons: [a11y()]`.

Storybook's React-free preview runtime and the registered addons are one
instance, in the preview and in the browser layer: an addon that both
previews import listens to Storybook's channel once, and a client story's
`fn()` is the spy that the Actions panel shows. A package that depends on
React, like `@storybook/addon-docs`, `storybook/theming` or the renderer,
is the layer's own, as React is: imported in both previews, it is two
instances, each listening to the channel. The framework knows an addon by
the package path of the preview its preset registers; a preview that a
preset registers by a plain string is never one instance.

An addon works for server stories when its preview renders no React: hooks
like `beforeEach` and `afterEach`, loaders, and decorators that work on the
DOM with Storybook's own hooks. a11y runs after each story, on the
document; Storybook's backgrounds, outline, measure and viewport are in
every preview. Import such an addon in `preview.server.tsx` too. An addon
whose decorator renders a component of its own belongs in `preview.tsx`,
for client stories.

A package that `preview.server.tsx` imports and that is not one instance is
server code, as any package that a route imports: `typeof window`,
`typeof document` and `typeof localStorage` are `"undefined"` in it. An
addon that depends on React, only for its panel in the manager, is such a
package, so a preview of it that checks for the browser that way does
nothing for server stories, without an error. Name it in `browserModules`,
as `["**/node_modules/@storybook/addon-x/**"]`, to give its preview the
browser's globals for server stories.

## After A Change

A change of a story file, of `preview.server.tsx`, or of a component that
only story files import renders the story again in place, once. A change
of `preview.tsx` renders it once too, after Storybook's Vite builder loads
the preview again, as it does for the `sb.mock()` calls of a preview file.
A change of the code that a route of the app imports loads the preview
again: the server code of the app runs once per document. A change of a
stylesheet that a preview imports shows in place.

## Docs

`@storybook/addon-docs` is an addon of `preview.tsx`: its docs page and
blocks render in the browser layer, with its React. The framework has it as
an optional peer dependency: install it next to `storybook`, in the same
version.

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

A docs page shows each story the way its kind renders:

- A client story renders in the docs page, inline. A new value from
  Controls renders it again in place, with the state it has.
- A server story renders in a page of the app, which has a document of its
  own: the docs page shows it in Storybook's iframe of the story, once, the
  primary story too. One that owns the document is 667px high, as a small
  phone's screen, a component 100px, as any story in an iframe. The iframe
  does not follow the height of its page: set a taller one with
  `parameters.docs.story.height`, on the meta for every story of a file.
- The page in each iframe has cookies, `localStorage` and `sessionStorage`
  of its own, which start empty, as in a new browser context: what a
  story's `beforeEach` or its page sets there, the stories in the iframes
  next to it do not read, and their cleanups do not clear it.

A server story with `parameters.docs.story.inline: true`, or a block's
`inline` prop, cannot render in the docs page, and shows an error that says
so.

A docs page does not run the play function of a server story, as it runs
none of any story, unless the story's `parameters.docs.story.autoplay` or
its block's `autoplay` prop asks for it. A server story that plays on a docs
page shares the window's focus and URL with the stories in the docs page's
other iframes, so a play that types or navigates can fail there: open the
story to play it.

An MDX file is a file with `"use client"`, as the framework compiles it, and
so is what it imports: client story files, for `of={…}`, and components of
the browser. A server story file is server code, which an MDX file cannot
import: name its story by id.

```mdx
import { Canvas, Meta } from "@storybook/addon-docs/blocks";
import * as PressButton from "./press-button.stories";

<Meta title="Introduction" />

<Canvas id="greeting--default" />

<Canvas of={PressButton.Pressed} />
```

Code that is only for the server, like `server-only` or a database, cannot
be imported in an MDX file either.

`Source` shows the snippet of Storybook's docgen, or the source of the
story: a server story renders on the server, so there is no snippet of
what it rendered. The args table reads the files with Storybook's docgen,
for both kinds.

## Not In This Version

- Controls on a docs page do not reach a server story, which is in an
  iframe, as they reach no story in an iframe in Storybook: open the story
  to change its args.
- Tags of `preview.server.tsx`: see Two Previews.
- A client story has the browser's `localStorage` and `sessionStorage`
  until the preview loads a server story file, and the page's storage of
  the server stories after it, which nothing clears before a client story.
- A change of an MDX file that shows a client story with `of={…}` fails
  that block until the preview loads again.
- Next's router in a client story: `useRouter()` throws there, and
  `usePathname()` returns `null`. A server story has the router.
- A docs page has the CSS of the client stories it shows inline: not that
  of the MDX file itself, or of `preview.tsx` on a page without a client
  story.
- Storybook's Vitest addon and portable stories (a story's `run()` in a
  Vitest test) are not supported yet: nothing tests them. Outside
  Storybook a server story leaves its stylesheets to the plugin's default,
  those of the setup files and the test file.
