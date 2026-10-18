import type { ComponentProps } from "react";

// A component of the docs pages, for the blockquotes of an MDX file. A module
// without a directive, which both layers evaluate, as they do the preview
// file: the docs page renders the browser layer's.
export function Blockquote(props: ComponentProps<"blockquote">) {
  return <blockquote data-testid="docs-blockquote" {...props} />;
}
