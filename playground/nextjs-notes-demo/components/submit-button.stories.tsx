"use client";

import { expect, fn, type Mock } from "storybook/test";
import { SubmitButton } from "./submit-button.tsx";
import preview from "#.storybook/preview.tsx";

// A client story of the button of the app's forms, which reads the status of
// its form with `useFormStatus()`. Its form's action is the `action` spy,
// a function of the browser, which a server story could not pass.
const meta = preview.type<{ args: { action: Mock<(data: FormData) => Promise<void>> } }>().meta({
  component: SubmitButton,
  args: { children: "Save note", action: fn() },
  render: ({ action, ...args }) => (
    <form action={action}>
      <SubmitButton {...args} />
    </form>
  ),
});

// Busy while the action runs: `play` holds it until it has seen that.
export const Pending = meta.story({
  play: async ({ args, canvas, userEvent }) => {
    let done!: () => void;
    args.action.mockImplementation(() => new Promise<void>((resolve) => (done = resolve)));
    const button = await canvas.findByRole("button", { name: "Save note" });
    await userEvent.click(button);
    await expect(args.action).toHaveBeenCalledOnce();
    await expect(await canvas.findByRole("button", { busy: true })).toBeDisabled();
    done();
    await expect(await canvas.findByRole("button", { busy: false })).toBeEnabled();
  },
});
