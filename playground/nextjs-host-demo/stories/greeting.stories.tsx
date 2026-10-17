import type { Meta, StoryObj } from "@storybook/nextjs-vite-rsc";
import { headers } from "next/headers";
import { expect, within } from "storybook/test";
import { Greeting } from "../app/components/greeting.tsx";
import { Like } from "../app/components/like.tsx";

// Server stories: a file without "use client" is server code. The component,
// the render and the decorators are Server Components in the request of a
// page, with Next's router and Server Actions.
const meta = {
  component: Greeting,
  args: { name: "Storybook" },
  decorators: [
    // An async decorator that reads the request.
    async (Story) => {
      const agent = (await headers()).get("user-agent");
      return (
        <div data-testid="server-decorator" data-agent={agent ? "read" : "none"}>
          <Story />
        </div>
      );
    },
  ],
} satisfies Meta<typeof Greeting>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText("Hello from Storybook")).toBeVisible();
    await expect(canvas.getByTestId("server-decorator")).toHaveAttribute("data-agent", "read");
  },
};

// A Client Component that calls a Server Action of the app.
export const ServerAction: Story = {
  render: () => <Like />,
  play: async ({ canvasElement, userEvent }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Likes: 0" }));
    await expect(await canvas.findByRole("button", { name: "Likes: 1" })).toBeVisible();
  },
};
