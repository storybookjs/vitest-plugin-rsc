import { Tag } from "host-package/ui";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";

// A file of the host that renders a node with a Client Component of a
// package in `node_modules` that is not pre-bundled: the node has the
// stylesheet of that component, as it has the one of a component of the app.
export function renderTag(container: HTMLElement) {
  return renderServer(<Tag>Tagged by the host</Tag>, {
    container,
    hostFiles: ["host/tag.tsx"],
  });
}
