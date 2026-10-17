import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { Greeting } from "../app/components/greeting.tsx";

// A file of the host that renders a node, like callout.tsx: the node has
// the CSS of this file. Under Vitest the plugin fills `files` in itself,
// with the test file.
export function renderGreeting(container: HTMLElement) {
  return renderServer(<Greeting name="the host" />, {
    container,
    files: ["host/greeting.tsx"],
  });
}
