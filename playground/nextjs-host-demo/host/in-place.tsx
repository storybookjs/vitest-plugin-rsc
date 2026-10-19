import { loadClientModule } from "vitest-plugin-rsc/nextjs/testing-library";
import * as badgeModule from "./in-place-badge.tsx";
import { show } from "./state.ts";

// `?view=in-place`: a component of a file of the host with `"use client"`,
// rendered again in place after a change of the file or of what it imports,
// as a framework renders a story again. Vite's client imports the file
// again, and `loadClientModule()` gives the new module's evaluation. Only
// this module takes that change: in a view that imports the file otherwise,
// it loads the document again.

type BadgeModule = typeof badgeModule;

export async function renderInPlace(container: Element): Promise<void> {
  const { renderClient } = await loadClientModule(await import("./render-client.tsx"));
  let unmount = () => {};
  const render = async (module: BadgeModule) => {
    const { Badge } = await loadClientModule(module);
    unmount();
    unmount = renderClient(Badge, container);
  };
  await render(badgeModule);
  import.meta.hot?.accept("./in-place-badge.tsx", (module) => {
    if (module) void show(() => render(module as unknown as BadgeModule));
  });
}
