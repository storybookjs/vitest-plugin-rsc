import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { Greeting } from "../app/components/greeting.tsx";

// A file of the host that renders a node, like callout.tsx: the node has
// the CSS of this file. `hostFiles` is this file, unless the host names
// others, as `?view=app-file` does (main.tsx). Under Vitest the plugin fills
// `hostFiles` in itself, with the test file.
export function renderGreeting(container: HTMLElement, hostFiles = ["host/greeting.tsx"]) {
  return renderServer(<Greeting name="the host" />, { container, hostFiles });
}

/** The greeting for another name, for `rerender()` of what `renderGreeting()` resolved with. */
export const greetingFor = (name: string) => <Greeting name={name} />;
