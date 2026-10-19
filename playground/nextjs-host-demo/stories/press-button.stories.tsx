"use client";

import { useArgs } from "storybook/preview-api";
import { expect, fn, within } from "storybook/test";
import preview from "../.storybook/preview.tsx";
import { PressButton } from "../app/components/press-button.tsx";
import "./press-button.stories.css";

// Client stories: a file with "use client" is a client boundary. Its stories
// render in the browser, as React renders a Client Component, without Next's
// app: ordinary stories of @storybook/react. An arg is passed as it is, so
// `fn()` is the spy that `play` and the Actions panel read.
const meta = preview.meta({
  component: PressButton,
  tags: ["autodocs"],
  args: { label: "Press", onPress: fn() },
  decorators: [
    (Story) => (
      <div className="story-frame" data-testid="meta-decorator">
        <Story />
      </div>
    ),
  ],
});

export const Pressed = meta.story({
  play: async ({ args, canvasElement, userEvent }) => {
    const canvas = within(canvasElement);
    const button = await canvas.findByRole("button", { name: "Press: 0" });
    // The decorator of preview.tsx.
    await expect(button).toHaveAttribute("data-theme", "storybook");
    await userEvent.click(button);
    await expect(args.onPress).toHaveBeenCalledOnce();
    await expect(await canvas.findByRole("button", { name: "Press: 1" })).toBeVisible();
  },
});

// Another client story of the file: a switch from one client story to the
// next renders it in a root of its own.
export const Labelled = meta.story({
  args: { label: "Labelled" },
});

// A story that sets its own args, with Storybook's hooks: the store's, one
// instance in the preview and in the browser layer.
export const RenamesItself = meta.story({
  args: { label: "Rename me" },
  render: function Render(args) {
    const [, updateArgs] = useArgs();
    return <PressButton {...args} onPress={() => updateArgs({ label: "Renamed" })} />;
  },
  play: async ({ canvasElement, userEvent }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Rename me: 0" }));
    await expect(await canvas.findByRole("button", { name: "Renamed: 1" })).toBeVisible();
  },
});
