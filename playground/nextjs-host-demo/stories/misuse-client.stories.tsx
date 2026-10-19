"use client";

import type { Meta, StoryObj } from "@storybook/nextjs-vite-rsc";

// Client stories that do what only a server story can: each shows an error
// that says what to do instead.
export default { tags: ["!test"] } satisfies Meta;

export const AsyncRender: StoryObj = {
  render: async () => <p>{await Promise.resolve("A Server Component")}</p>,
};

export const Page: StoryObj = {
  parameters: { nextjs: { url: "/" } },
};

// The decorators of the preview file that only a server story can have: an
// async one that reads the request, and one with a hook of React.
export const AsyncPreviewDecorator: StoryObj = {
  parameters: { visitor: true },
  render: () => <p>A client story</p>,
};

export const HookInPreviewDecorator: StoryObj = {
  parameters: { reactHook: true },
  render: () => <p>A client story</p>,
};
