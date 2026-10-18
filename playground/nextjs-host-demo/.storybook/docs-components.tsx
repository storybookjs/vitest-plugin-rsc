"use client";

import type { ComponentProps } from "react";
import { useTheme } from "storybook/theming";

// A component of the docs pages, for the blockquotes of an MDX file, with
// the theme of the docs page. A file with `"use client"`, as one that
// imports Storybook's theming has to be: the preview file has a reference
// to it, and the docs page renders the browser layer's.
export function Blockquote(props: ComponentProps<"blockquote">) {
  return <blockquote data-testid="docs-blockquote" data-theme-base={useTheme().base} {...props} />;
}
