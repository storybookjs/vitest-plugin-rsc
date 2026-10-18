import type { Meta, StoryObj } from "@storybook/nextjs-vite-rsc";
import { expect } from "storybook/test";
import { FieldError } from "./field.tsx";

// Server stories: a file without "use client" is server code, so a Client
// Component of it gets its args through Flight, as from a page. The forms of
// the app give the error as children; these are its `errors`.
const meta = {
  title: "UI/FieldError",
  component: FieldError,
} satisfies Meta<typeof FieldError>;

export default meta;

type Story = StoryObj<typeof meta>;

export const SeveralErrors: Story = {
  args: { errors: [{ message: "Title is required." }, { message: "Title is too long." }] },
  play: async ({ canvas }) => {
    const alert = await canvas.findByRole("alert");
    await expect(alert.querySelectorAll("li")).toHaveLength(2);
  },
};

// The same message twice shows once.
export const RepeatedError: Story = {
  args: { errors: [{ message: "Title is required." }, { message: "Title is required." }] },
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole("alert")).toHaveTextContent(/^Title is required\.$/);
  },
};
