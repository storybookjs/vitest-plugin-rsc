"use client";

import { usePathname } from "next/navigation";
import { useState, type MouseEvent } from "react";
import { expect, fn, userEvent, within } from "storybook/test";
import { Badge } from "../app/components/badge.tsx";
import { Button } from "../app/components/button.tsx";

// A story file with `"use client"` is code of the browser layer, as such a
// file is in Next. Its stories render in the browser and not on the server:
// an arg can be a function, and a `render` can have state.
export default {
  title: "Client/Button",
  component: Button,
  args: { onClick: fn(), children: "Press" },
};

type Args = { onClick(event: MouseEvent<HTMLButtonElement>): void; children: string };
type Play = { args: Args; canvasElement: HTMLElement };

export const Default = {
  async play({ args, canvasElement }: Play) {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Press" }));
    await expect(args.onClick).toHaveBeenCalledOnce();
  },
};

export const Counting = {
  parameters: { nextjs: { url: "/notes/7" } },
  render: function Counting(args: Args) {
    const [count, setCount] = useState(0);
    // Next's own router, at the URL of the story.
    const pathname = usePathname();
    return (
      <>
        <Button
          onClick={(event) => {
            setCount(count + 1);
            args.onClick(event);
          }}
        >
          {args.children} at {pathname}: {count}
        </Button>
      </>
    );
  },
  async play({ args, canvasElement }: Play) {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Press at /notes/7: 0" }));
    await userEvent.click(await canvas.findByRole("button", { name: "Press at /notes/7: 1" }));
    await expect(await canvas.findByRole("button", { name: "Press at /notes/7: 2" })).toBeVisible();
    await expect(args.onClick).toHaveBeenCalledTimes(2);
  },
};

// A Client Component with a CSS module and an image of its own: the story
// loads its CSS, as the page of the app does.
export const WithBadge = {
  render: (args: Args) => (
    <Button {...args}>
      <Badge>New</Badge>
    </Button>
  ),
};
