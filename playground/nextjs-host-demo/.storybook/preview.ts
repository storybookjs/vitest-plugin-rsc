import addonDocs from "@storybook/addon-docs";
import { definePreview } from "@storybook/nextjs-vite-rsc";
import { createElement } from "react";

// CSF Next: the stories make their meta with `preview.meta()`. A story file in
// CSF 3, like stories/spied-button.stories.tsx, works with it too.
export default definePreview({
  addons: [addonDocs()],
  parameters: {
    layout: "padded",
  },
  // A decorator of the project is a Server Component around the story, also
  // around a story of a file with "use client".
  decorators: [
    (Story) => createElement("div", { "data-testid": "project-decorator" }, createElement(Story)),
  ],
});
