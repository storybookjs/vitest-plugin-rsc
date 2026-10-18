import type { Preview } from "@storybook/nextjs-vite-rsc";
import { ThemeProvider } from "../app/components/theme.tsx";
import { Blockquote } from "./docs-components.tsx";
import "./preview.css";

// The project's decorator, around every story: a Client Component, which a
// server story gets through Flight and a client story from the browser layer.
export default {
  decorators: [
    (Story) => (
      <ThemeProvider theme="storybook">
        <Story />
      </ThemeProvider>
    ),
  ],
  // What renders the elements of an MDX file, on top of the docs page's own.
  parameters: { docs: { components: { blockquote: Blockquote } } },
} satisfies Preview;
