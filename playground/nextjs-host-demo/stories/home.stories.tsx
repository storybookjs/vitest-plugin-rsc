import type { Meta, StoryObj } from "@storybook/nextjs-vite-rsc";
import { expect, within } from "storybook/test";

// A story without a component and a render is the page of the app at its URL,
// in its layouts, which own the document.
export default {} satisfies Meta;

export const Home: StoryObj = {
  parameters: { nextjs: { url: "/" } },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByRole("heading", { name: "Home" })).toBeVisible();
  },
};
