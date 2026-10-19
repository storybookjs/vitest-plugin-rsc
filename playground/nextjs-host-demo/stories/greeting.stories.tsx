import type { Meta, StoryObj } from "@storybook/nextjs-vite-rsc";
import { cookies, headers } from "next/headers";
import { expect, within } from "storybook/test";
import { runInServerAction } from "vitest-plugin-rsc/nextjs/testing-library";
import { Greeting } from "../app/components/greeting.tsx";
import { Like } from "../app/components/like.tsx";

// Server stories: a file without "use client" is server code. The component,
// the render and the decorators are Server Components in the request of a
// page, with Next's router and Server Actions.
const meta = {
  component: Greeting,
  tags: ["autodocs"],
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

// In the layouts of the app, which own the document, in place of the page at
// `url`.
export const InLayouts: Story = {
  parameters: { nextjs: { url: "/", layouts: true } },
  play: async ({ canvasElement }) => {
    const main = within(canvasElement).getByRole("main");
    await expect(await within(main).findByText("Hello from Storybook")).toBeVisible();
  },
};

// What the story's `beforeEach` sets is there for its render: a cookie of
// the app, set in a Server Action, and the browser's storage. The decorator
// of the preview file that reads the cookie, async, as a server story has it.
export const Seeded: Story = {
  parameters: { visitor: true },
  beforeEach: async () => {
    await runInServerAction(async () => (await cookies()).set("visitor", "Ada"));
    localStorage.setItem("visitor", "Ada");
  },
  render: async () => <p>Visitor: {(await cookies()).get("visitor")?.value ?? "none"}</p>,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText("Visitor: Ada")).toBeVisible();
    await expect(canvas.getByTestId("visitor")).toHaveAttribute("data-visitor", "Ada");
    await expect(localStorage.getItem("visitor")).toBe("Ada");
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
