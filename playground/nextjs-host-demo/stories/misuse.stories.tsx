import type { Meta, StoryObj } from "@storybook/nextjs-vite-rsc";
import { useState } from "react";
import { fn } from "storybook/test";
import { PressButton } from "../app/components/press-button.tsx";

// Server stories that a user can get wrong: each shows an error that says
// what to do instead.
export default { tags: ["!test"] } satisfies Meta;

export const HookOnServer: StoryObj = {
  render: () => {
    const [count] = useState(0);
    return <p>{count}</p>;
  },
};

export const FunctionArg: StoryObj<typeof PressButton> = {
  render: ({ label, onPress }) => <PressButton label={label} onPress={onPress} />,
  args: { label: "Press", onPress: fn() },
};

// A story that fails while the layouts of the app own the document: the
// error shows in Storybook's own document again.
export const ThrowsInLayouts: StoryObj = {
  parameters: { nextjs: { url: "/", layouts: true } },
  render: () => {
    throw new Error("The story failed in the layouts");
  },
};

// Pages: a story without a component and a render.
export const PageWithoutUrl: StoryObj = {};

export const PageInLayouts: StoryObj = {
  parameters: { nextjs: { url: "/", layouts: true } },
};

export const MountOnPage: StoryObj = {
  parameters: { nextjs: { url: "/" } },
  play: async ({ mount }) => {
    await mount(<p>A component</p>);
  },
};

// A server story that a docs page renders inline, in its own document, as
// it does a client story: see misuse.mdx.
export const InlineOnDocs: StoryObj = {
  parameters: { docs: { story: { inline: true } } },
  render: () => <p>A server story, inline</p>,
};
