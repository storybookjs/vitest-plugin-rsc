import type { Preview } from "@storybook/nextjs-vite-rsc";
import { ThemeProvider } from "../app/components/theme.tsx";
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
} satisfies Preview;
