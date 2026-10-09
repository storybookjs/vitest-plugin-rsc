// The docs page of Storybook, which React DOM renders: code of the browser
// layer. It is one of the `host.ui.files` that the preset gives
// vitest-plugin-rsc, so the preview has a stand-in for it, and the docs page
// imports it in a module graph that lives as long as the document: see
// addon-docs.ts.

export async function createDocsRenderer() {
  const { DocsRenderer } = await import("@storybook/addon-docs");
  return new DocsRenderer();
}
