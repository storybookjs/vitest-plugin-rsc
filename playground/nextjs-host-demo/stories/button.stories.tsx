"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import { expect, fn, userEvent } from "storybook/test";
import preview from "../.storybook/preview.ts";
import { Badge } from "../app/components/badge.tsx";
import { Button } from "../app/components/button.tsx";

// A story file with `"use client"` is code of the browser layer, as such a
// file is in Next. Its stories render in the browser and not on the server:
// an arg can be a function, and a `render` can have state.
const meta = preview.meta({
  title: "Client/Button",
  component: Button,
  args: { onClick: fn(), children: "Press" },
  // A decorator of the story file renders in the browser too, inside the
  // decorators of the project, which render on the server.
  decorators: [
    (Story) => (
      <div data-testid="meta-decorator">
        <Story />
      </div>
    ),
  ],
});

export const Default = meta.story({
  async play({ args, canvas }) {
    await userEvent.click(canvas.getByRole("button", { name: "Press" }));
    await expect(args.onClick).toHaveBeenCalledOnce();
  },
});

// A story that another one extends, in CSF Next.
export const Pressed = Default.extend({
  args: { children: "Pressed" },
  async play({ args, canvas }) {
    await userEvent.click(canvas.getByRole("button", { name: "Pressed" }));
    await expect(args.onClick).toHaveBeenCalledOnce();
  },
});

export const Counting = meta.story({
  parameters: { nextjs: { url: "/notes/7" } },
  render: function Counting(args) {
    const [count, setCount] = useState(0);
    // Next's own router, at the URL of the story.
    const pathname = usePathname();
    return (
      <Button
        onClick={(event) => {
          setCount(count + 1);
          args.onClick?.(event);
        }}
      >
        {args.children} at {pathname}: {count}
      </Button>
    );
  },
  async play({ args, canvas }) {
    await userEvent.click(await canvas.findByRole("button", { name: "Press at /notes/7: 0" }));
    await userEvent.click(await canvas.findByRole("button", { name: "Press at /notes/7: 1" }));
    await expect(await canvas.findByRole("button", { name: "Press at /notes/7: 2" })).toBeVisible();
    await expect(args.onClick).toHaveBeenCalledTimes(2);
  },
});

// A Client Component with a CSS module and an image of its own: the story
// loads its CSS, as the page of the app does.
export const WithBadge = meta.story({
  render: (args) => (
    <Button {...args}>
      <Badge>New</Badge>
    </Button>
  ),
});
