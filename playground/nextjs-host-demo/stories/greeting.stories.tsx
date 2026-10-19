import { cookies } from "next/headers";
import { expect, within } from "storybook/test";
import { runInServerAction } from "vitest-plugin-rsc/nextjs/testing-library";
import preview from "../.storybook/preview.server.tsx";
import { Greeting } from "../app/components/greeting.tsx";
import { Like } from "../app/components/like.tsx";
import { db } from "../app/db.ts";

// Server stories: a file without "use client" is server code. The component,
// the render and the decorators are Server Components in the request of a
// page, with Next's router and Server Actions.
const meta = preview.meta({
  component: Greeting,
  tags: ["autodocs"],
  args: { name: "Storybook" },
});

export const Default = meta.story({
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText("Hello from Storybook")).toBeVisible();
    await expect(canvas.getByTestId("server-decorator")).toHaveAttribute("data-agent", "read");
  },
});

// In the layouts of the app, which own the document, in place of the page at
// `url`.
export const InLayouts = meta.story({
  parameters: { nextjs: { url: "/", layouts: true } },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.tagName).toBe("HTML");
    const main = within(canvasElement).getByRole("main");
    await expect(await within(main).findByText("Hello from Storybook")).toBeVisible();
    await expect(within(main).getByTestId("server-decorator")).toHaveAttribute(
      "data-agent",
      "read",
    );
  },
});

// What the server preview's `beforeEach` seeds, and what the story's sets,
// are there for its render: the app's database, a cookie of the app, set in
// a Server Action, and the browser's storage.
export const Seeded = meta.story({
  beforeEach: async () => {
    await runInServerAction(async () => (await cookies()).set("visitor", "Ada"));
    localStorage.setItem("visitor", "Ada");
  },
  render: async () => (
    <>
      <p>Visitor: {(await cookies()).get("visitor")?.value ?? "none"}</p>
      <p>Seeded: {db.get("visitor") ?? "none"}</p>
    </>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText("Visitor: Ada")).toBeVisible();
    await expect(canvas.getByText("Seeded: Grace")).toBeVisible();
    await expect(localStorage.getItem("visitor")).toBe("Ada");
  },
});

// A Client Component that calls a Server Action of the app.
export const ServerAction = meta.story({
  render: () => <Like />,
  play: async ({ canvasElement, userEvent }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Likes: 0" }));
    await expect(await canvas.findByRole("button", { name: "Likes: 1" })).toBeVisible();
  },
});
