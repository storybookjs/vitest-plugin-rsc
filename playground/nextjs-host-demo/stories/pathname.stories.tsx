import { expect, within } from "storybook/test";
import preview from "../.storybook/preview.server.tsx";
import { Pathname } from "../app/components/pathname.tsx";

// The URL of a story is a function of its args here: each render asks it
// again. A new value of `step` renders the component on a page at its URL,
// one of `label` in place, at the URL the page opened.
const meta = preview.type<{ args: { step: string } }>().meta({
  component: Pathname,
  args: { label: "Step", step: "1.0" },
  argTypes: { step: { control: "select", options: ["1.0", "2.0"] } },
  parameters: { nextjs: { url: ({ args }) => `/steps/${args.step}` } },
});

export const Step = meta.story({
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText(`${args.label} at /steps/${args.step}`)).toBeVisible();
  },
});
