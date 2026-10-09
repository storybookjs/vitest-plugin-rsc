import preview from "../.storybook/preview.ts";
import { Greeting } from "../app/components/greeting.tsx";

// A Server Component: it awaits `headers()`, and renders a Client Component.
// Its docs page shows each story in an iframe of its own.
const meta = preview.meta({
  title: "Server/Greeting",
  component: Greeting,
  args: { name: "Storybook" },
  tags: ["autodocs"],
});

export const Default = meta.story();

export const OtherName = meta.story({ args: { name: "a story with other args" } });
