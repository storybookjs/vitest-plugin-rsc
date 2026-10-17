import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { Callout } from "../app/components/callout.tsx";

// A file of the host that renders a node, as a story file is to Storybook.
// The node has the CSS of the files the host says render it, `files`: this
// one, and not another file of the host that the page or the dev server
// loaded before. Storybook's framework passes the preview file and the
// story's file the same way. See test/host.test.ts.
export function renderCallout(container: HTMLElement) {
  return renderServer(<Callout>From the host</Callout>, {
    container,
    files: ["host/callout.tsx"],
  });
}
