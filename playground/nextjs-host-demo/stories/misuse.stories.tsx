import type { Meta, StoryObj } from "@storybook/nextjs-vite-rsc";
import { useState } from "react";
import { fn } from "storybook/test";
import { PressButton } from "../app/components/press-button.tsx";

// Server stories that do what only a client story can: each shows an error
// that says what to do instead.
export default { tags: ["!test"] } satisfies Meta;

export const HookOnServer: StoryObj = {
  render: () => {
    const [count] = useState(0);
    return <p>{count}</p>;
  },
};

export const FunctionArg: StoryObj<typeof PressButton> = {
  render: ({ label, onPress }) => <PressButton label={label} onPress={onPress} />,
  args: { label: "Press", onPress: fn() },
};
