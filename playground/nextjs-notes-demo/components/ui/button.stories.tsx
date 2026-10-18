"use client";

import type { Meta, StoryObj } from "@storybook/nextjs-vite-rsc";
import { expect, fn } from "storybook/test";
import { Button } from "./button.tsx";

// Client stories: a file with "use client" renders in the browser, as React
// renders a Client Component. An arg is passed as it is, so `fn()` is the spy
// that `play` and the Actions panel read.
const meta = {
  title: "UI/Button",
  component: Button,
  tags: ["autodocs"],
  args: { children: "Create note", onClick: fn() },
} satisfies Meta<typeof Button>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Pressed: Story = {
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole("button", { name: "Create note" }));
    await expect(args.onClick).toHaveBeenCalledOnce();
  },
};

export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole("button", { name: "Create note" })).toBeDisabled();
  },
};
