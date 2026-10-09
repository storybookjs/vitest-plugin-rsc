// The annotations of the renderer, which every story of the project gets: in
// CSF 3 through the `previewAnnotations` of the preset, in CSF Next through
// `definePreview()`. The rendering itself is in render.tsx.

export { applyDecorators, render, renderToCanvas } from "./render.tsx";

export const parameters = {
  renderer: "nextjs-rsc",
  // A docs page shows every story in an iframe of its own. The plugin runs
  // one app per document, and a story renders a page of that app.
  docs: { story: { inline: false, iframeHeight: "320px" } },
};
