"use client";

import type { ComponentProps } from "react";
import { expect, fn, userEvent } from "storybook/test";
import type { Meta, StoryObj } from "@storybook/nextjs-vite-rsc";
import { Button } from "../app/components/button.tsx";

// A story file with "use client" in CSF 3, with a default export: it works
// next to the stories of CSF Next.
type Args = ComponentProps<typeof Button>;

export default {
  title: "Client/ButtonInCsf3",
  component: Button,
  args: { onClick: fn(), children: "Tap" },
} satisfies Meta<Args>;

export const Default: StoryObj<Args> = {
  async play({ args, canvas }) {
    await userEvent.click(canvas.getByRole("button", { name: "Tap" }));
    await expect(args.onClick).toHaveBeenCalledOnce();
  },
};
