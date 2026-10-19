// The errors of the framework: each names the rule that was broken and what
// to do instead.

/** A story file without a story of `meta.story()`. */
export const notCsfNext = (file: string): Error =>
  new Error(
    `${file} has no story of meta.story(): @storybook/nextjs-vite-rsc loads CSF Next story files ` +
      `only. Import a preview, \`import preview from "../.storybook/preview"\` in a file with ` +
      `"use client", or \`import preview from "../.storybook/preview.server"\` in a file without ` +
      `it, and write each story as \`export const Default = meta.story({ ... })\` of ` +
      `\`const meta = preview.meta({ ... })\`.`,
  );

/** A file whose preview is made by the factory of the other layer. */
export const wrongFactory = (file: string, client: boolean): Error =>
  new Error(
    client
      ? `${file} has "use client", so its stories render in the browser, and its preview is made ` +
          `with defineServerPreview(). A file with "use client" imports .storybook/preview.tsx, ` +
          `whose definePreview() is the one of "@storybook/nextjs-vite-rsc".`
      : `${file} has no "use client", so it is server code, and its preview is not made with ` +
          `defineServerPreview(). A story file without "use client" imports ` +
          `.storybook/preview.server.tsx, made with defineServerPreview() of ` +
          `"@storybook/nextjs-vite-rsc/server"; .storybook/preview.tsx starts with "use client".`,
  );

/** `beforeAll` in a server preview, which Storybook never runs. */
export const beforeAllInServerPreview = (): Error =>
  new Error(
    `defineServerPreview() got a beforeAll, which Storybook runs only for .storybook/preview.tsx. ` +
      `Use beforeEach or loaders, which run before each server story.`,
  );

/** Globals of a server preview that the project's preview does not declare. */
export const undeclaredGlobals = (file: string, keys: string[]): Error =>
  new Error(
    `The preview of ${file} declares the globals ${keys.join(", ")}, and ` +
      `.storybook/preview.tsx does not: globals are declared in preview.tsx, as Storybook reads ` +
      `them from there for every story. Move globalTypes and initialGlobals there; server ` +
      `stories read them from context.globals as client stories do.`,
  );

export const pageWithoutUrl = (id: string): Error =>
  new Error(
    `The story ${id} has no component and no render, so it is a page of the app, which needs ` +
      `a URL: add \`parameters: { nextjs: { url: "/notes" } }\` with the path of the page. For ` +
      `a story of a component, give it a \`component\` or a \`render\`.`,
  );

export const pageInLayouts = (id: string): Error =>
  new Error(
    `The story ${id} is a page, which renders in its layouts already; \`layouts\` is for a ` +
      `component. Remove it.`,
  );

/** `mount(ui)` in the `play` of a page story. */
export const nothingToMount = (id: string): Error =>
  new Error(
    `The story ${id} is a page, which has nothing to mount: call \`mount()\` without ` +
      `arguments, or give the story a component.`,
  );

/** A server story that a docs page renders inline, in its own document. */
export const serverStoryInline = (id: string): Error =>
  new Error(
    `The story ${id} renders on the server, in a page of the app, which a docs page shows in ` +
      `an iframe. Remove \`docs: { story: { inline: true } }\` from its parameters.`,
  );

/** The plugin in the Vite config of the project and of the framework. */
export const pluginTwice = (): Error =>
  new Error(
    "@storybook/nextjs-vite-rsc adds vitest-plugin-rsc to the Vite config itself, and the " +
      "Vite config of the project has it already. Give Storybook a Vite config without it: " +
      "`framework: { name: '@storybook/nextjs-vite-rsc', options: { builder: { " +
      "viteConfigPath: '.storybook/vite.config.ts' } } }` in .storybook/main.ts.",
  );
