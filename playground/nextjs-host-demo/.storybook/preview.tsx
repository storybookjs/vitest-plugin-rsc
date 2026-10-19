"use client";

import { definePreview } from "@storybook/nextjs-vite-rsc";
import a11y from "@storybook/addon-a11y";
import docs from "@storybook/addon-docs";
import type { ComponentProps } from "react";
import { useTheme } from "storybook/theming";
import { ThemeProvider } from "../app/components/theme.tsx";
import "./preview.css";

// The preview of the stories of files with "use client", which render in
// the browser, and of the docs pages: the project's preview of Storybook.

// A component of the docs pages, for the blockquotes of an MDX file, with
// the theme of the docs page.
function Blockquote(props: ComponentProps<"blockquote">) {
  return <blockquote data-testid="docs-blockquote" data-theme-base={useTheme().base} {...props} />;
}

export default definePreview({
  addons: [docs(), a11y()],
  // A Client Component that provides context, around every client story.
  decorators: [
    (Story) => (
      <ThemeProvider theme="storybook">
        <Story />
      </ThemeProvider>
    ),
  ],
  // What renders the elements of an MDX file, on top of the docs page's own.
  // @ts-expect-error addon-docs reads `docs.components`, which its types leave out.
  parameters: { docs: { components: { blockquote: Blockquote } } },
});
