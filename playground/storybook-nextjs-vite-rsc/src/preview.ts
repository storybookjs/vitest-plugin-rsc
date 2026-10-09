import {
  definePreview as definePreviewBase,
  definePreviewAddon,
  type PreviewAddon,
} from "storybook/internal/csf";
import type { ProjectAnnotations, Renderer } from "storybook/internal/types";
import { registerStories } from "./csf-next.ts";
import * as frameworkAnnotations from "./entry-preview.tsx";
import { clientStoryBoundary } from "./render.tsx";

// The preview of CSF Next. In CSF Next, Storybook takes the annotations of the
// project from `.storybook/preview` alone, and not from the
// `previewAnnotations` of the preset. So the framework's own come in here, as
// the first addon. See index.ts for the types of `definePreview()`.

/** @internal The framework's annotations, as an addon of CSF Next. */
export const frameworkAddon = definePreviewAddon(
  frameworkAnnotations as unknown as ProjectAnnotations<Renderer>,
);

/** @internal `definePreview()` without its types: see index.ts. */
export function __definePreview(
  input: { addons?: PreviewAddon<never>[] } & ProjectAnnotations<Renderer>,
) {
  // The decorators of the project are Server Components around a client
  // story too: the boundary is the innermost of them, see render.tsx.
  const decorators = [clientStoryBoundary(), ...[input.decorators ?? []].flat()];
  return registerStories(
    definePreviewBase({
      ...input,
      decorators,
      addons: [frameworkAddon, ...(input.addons ?? [])],
    } as typeof input),
  );
}
