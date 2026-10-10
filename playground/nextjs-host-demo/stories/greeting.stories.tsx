import { Greeting } from "../app/components/greeting.tsx";

// A Server Component: it awaits `headers()`, and renders a Client Component.
export default {
  title: "Server/Greeting",
  component: Greeting,
  args: { name: "Storybook" },
};

export const Default = {};

export const OtherName = { args: { name: "a story with other args" } };
