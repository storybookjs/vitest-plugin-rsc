import type { Meta, StoryObj } from "@storybook/nextjs-vite-rsc";
import { expect } from "storybook/test";
import FlashCookieProbe from "./flash-cookie-probe.tsx";

// A Server Component that reads the cookies and headers of its request, and
// sets a cookie in a Server Action: see flash-cookie-probe.test.tsx.
const meta = {
  title: "Components/FlashCookieProbe",
  component: FlashCookieProbe,
  tags: ["autodocs"],
} satisfies Meta<typeof FlashCookieProbe>;

export default meta;

type Story = StoryObj<typeof meta>;

// What `parameters.nextjs.headers` sends with the request of the story.
export const FromRequest: Story = {
  parameters: { nextjs: { headers: { cookie: "flash=hello", "x-test-request": "story" } } },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("flash: hello")).toBeVisible();
    await expect(canvas.getByText("request id: story")).toBeVisible();
  },
};

// The Server Action sets the cookie, and the component reads it again.
export const SetFlash: Story = {
  play: async ({ canvas, userEvent }) => {
    await expect(await canvas.findByText("flash: empty")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Set flash" }));
    await expect(await canvas.findByText("flash: saved")).toBeVisible();
  },
};
