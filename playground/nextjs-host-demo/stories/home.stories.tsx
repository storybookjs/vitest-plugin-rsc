import type { Meta, StoryObj } from "@storybook/nextjs-vite-rsc";
import { expect } from "storybook/test";

// A story without a component and a render is the page of the app at its URL,
// in its layouts, which own the document.
export default {} satisfies Meta;

export const Home: StoryObj<{ visitor: string }> = {
  parameters: { nextjs: { url: "/" } },
  // A page has no props: its args are inputs of the story's `beforeEach`,
  // which runs before the request. What it stores is there while the page
  // renders.
  args: { visitor: "Ada" },
  beforeEach: ({ args }) => localStorage.setItem("visitor", args.visitor),
  play: async ({ canvas, canvasElement }) => {
    // The page owns the document: its canvas is the page's `<body>`, the
    // story's root.
    await expect(canvasElement).toBe(document.getElementById("storybook-root"));
    await expect(canvasElement.tagName).toBe("BODY");
    await expect(await canvas.findByRole("heading", { name: "Home" })).toBeVisible();
    await expect(localStorage.getItem("visitor")).toBe("Ada");
  },
};
