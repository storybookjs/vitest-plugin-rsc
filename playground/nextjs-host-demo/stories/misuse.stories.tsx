import { useState } from "react";
import { fn } from "storybook/test";
import preview from "../.storybook/preview.server.tsx";
import { PressButton } from "../app/components/press-button.tsx";

// Server stories that a user can get wrong: each shows an error that says
// what to do instead.
const meta = preview.meta({ tags: ["!test"] });

export const HookOnServer = meta.story({
  render: () => {
    const [count] = useState(0);
    return <p>{count}</p>;
  },
});

// A function arg reaches a Client Component: React says that Flight cannot
// send it.
export const FunctionArg = meta.type<{ args: { onPress: () => void } }>().story({
  render: ({ onPress }) => <PressButton label="Press" onPress={onPress} />,
  args: { onPress: fn() },
});

// A story that fails while the layouts of the app own the document: Next
// shows its error page, and Storybook its error display over it.
export const ThrowsInLayouts = meta.story({
  parameters: { nextjs: { url: "/", layouts: true } },
  render: () => {
    throw new Error("The story failed in the layouts");
  },
});

// Pages: a story without a component and a render.
export const PageWithoutUrl = meta.story({});

export const PageInLayouts = meta.story({
  parameters: { nextjs: { url: "/", layouts: true } },
});

export const MountOnPage = meta.story({
  parameters: { nextjs: { url: "/" } },
  play: async ({ mount }) => {
    await mount(<p>A component</p>);
  },
});

// A page whose play fails once Next's not-found page has loaded, which
// renders the document anew. Storybook shows an exception of play in the
// Interactions panel, and with `throwPlayFunctionExceptions` in its error
// display too, in the document of that page.
export const PlayFailsOnNotFound = meta.story({
  parameters: { nextjs: { url: "/gone" }, throwPlayFunctionExceptions: true },
  play: async ({ canvas }) => {
    await canvas.findByText("This page could not be found.");
    throw new Error("The play failed on the not-found page");
  },
});

// A server story that a docs page renders inline, in its own document, as
// it does a client story: see misuse.mdx.
export const InlineOnDocs = meta.story({
  parameters: { docs: { story: { inline: true } } },
  render: () => <p>A server story, inline</p>,
});
