"use client";

import { expect, fn } from "storybook/test";
import { Button } from "./button.tsx";
import preview from "#.storybook/preview.tsx";

// Client stories: a file with "use client" renders in the browser, as React
// renders a Client Component. An arg is passed as it is, so `fn()` is the spy
// that `play` and the Actions panel read.
const meta = preview.meta({
  component: Button,
  tags: ["autodocs"],
  args: { children: "Create note", onClick: fn() },
});

export const Pressed = meta.story({
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole("button", { name: "Create note" }));
    await expect(args.onClick).toHaveBeenCalledOnce();
  },
});

export const Disabled = meta.story({
  args: { disabled: true },
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole("button", { name: "Create note" })).toBeDisabled();
  },
});
