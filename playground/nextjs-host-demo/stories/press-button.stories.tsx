"use client";

import type { Meta, StoryObj } from "@storybook/nextjs-vite-rsc";
import { expect, fn, within } from "storybook/test";
import { PressButton } from "../app/components/press-button.tsx";
import "./press-button.stories.css";

// Client stories: a file with "use client" is a client boundary. Its stories
// render in the browser, as React renders a Client Component, without Next's
// app. An arg is passed as it is, so `fn()` is the spy that `play` and the
// Actions panel read.
const meta = {
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
} satisfies Meta<typeof PressButton>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Pressed: Story = {
  play: async ({ args, canvasElement, userEvent }) => {
    const canvas = within(canvasElement);
    const button = await canvas.findByRole("button", { name: "Press: 0" });
    // The project's decorator, a Client Component that the preview file renders.
    await expect(button).toHaveAttribute("data-theme", "storybook");
    await userEvent.click(button);
    await expect(args.onPress).toHaveBeenCalledOnce();
    await expect(await canvas.findByRole("button", { name: "Press: 1" })).toBeVisible();
  },
};

// Another client story of the file: a switch from one client story to the
// next renders it in a root of its own.
export const Labelled: Story = {
  args: { label: "Labelled" },
};

// What `play` sees as the story has rendered, without waiting: the story in
// the project's decorator, whose `ThemeProvider` the browser loaded first.
export const AtOnce: Story = {
  args: { label: "At once" },
  play: async ({ canvas }) => {
    const theme = canvas.getByTestId("theme");
    await expect(theme).toHaveAttribute("data-theme", "storybook");
    await expect(canvas.getByRole("button", { name: "At once: 0" })).toHaveAttribute(
      "data-theme",
      "storybook",
    );
  },
};
