// The mark of a server preview, by which the loader tells it from the
// project's preview. A symbol of the registry: a "use client" file that
// imports the server preview evaluates it in the browser layer.
const mark = Symbol.for("@storybook/nextjs-vite-rsc/server-preview");

export const markServerPreview = <T extends object>(preview: T): T =>
  Object.assign(preview, { [mark]: true });

export const isServerPreview = (preview: object): boolean => mark in preview;
