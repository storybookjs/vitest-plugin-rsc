// The errors of the framework: each names the rule that was broken and what
// to do instead.

export const notCsfNext = (file: string): Error =>
  new Error(
    `${file} has no story of meta.story(): @storybook/nextjs-vite-rsc loads CSF Next story files ` +
      `only. Write \`export const Default = meta.story({ ... })\` of \`const meta = ` +
      `preview.meta({ ... })\`, with the preview of .storybook/preview.tsx in a file with ` +
      `"use client", or of .storybook/preview.server.tsx in a file without it.`,
  );

export const wrongFactory = (file: string, client: boolean): Error =>
  new Error(
    client
      ? `${file} has "use client", so its stories render in the browser, and its preview is made ` +
          `with defineServerPreview(). Import .storybook/preview.tsx, made with definePreview() ` +
          `of "@storybook/nextjs-vite-rsc".`
      : `${file} has no "use client", so it is server code, and its preview is not made with ` +
          `defineServerPreview() of "@storybook/nextjs-vite-rsc/server". A story file without ` +
          `"use client" imports .storybook/preview.server.tsx; .storybook/preview.tsx starts ` +
          `with "use client".`,
  );

export const beforeAllInServerPreview = (): Error =>
  new Error(
    `defineServerPreview() got a beforeAll, which Storybook runs only for .storybook/preview.tsx. ` +
      `Use beforeEach or loaders, which run before each server story.`,
  );

export const undeclaredGlobals = (file: string, keys: string[]): Error =>
  new Error(
    `The preview of ${file}, or one of its addons, declares the globals ${keys.join(", ")}, ` +
      `and .storybook/preview.tsx does not: globals are declared in preview.tsx, where ` +
      `Storybook reads them for every story. Server stories read them from context.globals too.`,
  );

export const pageWithoutUrl = (id: string): Error =>
  new Error(
    `The story ${id} has no component and no render, so it is a page of the app, which needs ` +
      `a URL: add \`parameters: { nextjs: { url: "/notes" } }\`, or give it a component. A ` +
      `function of \`url\` has to return one for the story's args and globals.`,
  );

export const nothingToMount = (id: string): Error =>
  new Error(
    `The story ${id} is a page, which has nothing to mount: call \`mount()\` without arguments.`,
  );

export const serverStoryInline = (id: string): Error =>
  new Error(
    `The story ${id} renders on the server, in a page of the app, which a docs page shows in ` +
      `an iframe. Remove \`docs: { story: { inline: true } }\` from its parameters, or the ` +
      `\`inline\` prop of its block.`,
  );

export const pluginTwice = (): Error =>
  new Error(
    "@storybook/nextjs-vite-rsc adds vitest-plugin-rsc itself, and the project's Vite config " +
      "has it already. Give Storybook another: `framework: { name: " +
      "'@storybook/nextjs-vite-rsc', options: { builder: { viteConfigPath: " +
      "'.storybook/vite.config.ts' } } }` in .storybook/main.ts.",
  );
