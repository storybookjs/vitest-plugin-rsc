import { linkStylesheetsOf, loadClientModule } from "vitest-plugin-rsc/nextjs/client-components";
import * as badgeModule from "./in-place-badge.tsx";
import * as noteModule from "./in-place-note.tsx";
import { show, state } from "./state.ts";

// `?view=in-place`: a component of a file of the host with `"use client"`,
// rendered again in place after a change of the file or of what it imports,
// as a framework renders a story again. Vite's client imports the file
// again, and `loadClientModule()` gives the new module's evaluation. Each
// render is a use of the file's stylesheets as they are then, which ends
// once the next one's have loaded, so the component is never without them.
// Only
// this module takes that change: in a view that imports the file otherwise,
// it loads the document again. The host also reads a file that the first
// one imports, in-place-note.tsx, as a docs page imports the stories that
// it shows.

let modules = { badge: badgeModule, note: noteModule };

export async function renderInPlace(container: Element): Promise<void> {
  const { renderClient } = await loadClientModule(await import("./render-client.tsx"));
  let unmount = () => {};
  let use = new AbortController();
  const render = async () => {
    const { Badge, note } = await loadClientModule(modules.badge);
    state.__hostOneNote = (await loadClientModule(modules.note)).note === note;
    const next = new AbortController();
    await linkStylesheetsOf(["host/in-place-badge.tsx"], { signal: next.signal });
    use.abort();
    use = next;
    unmount();
    unmount = renderClient(Badge, container);
  };
  await render();
  // A change of the note changes both modules: Vite calls this once for
  // each, and the renders run one after the other.
  let rendered = Promise.resolve();
  import.meta.hot?.accept(["./in-place-badge.tsx", "./in-place-note.tsx"], ([badge, note]) => {
    modules = {
      badge: (badge as typeof badgeModule | undefined) ?? modules.badge,
      note: (note as typeof noteModule | undefined) ?? modules.note,
    };
    rendered = rendered.then(() => show(render));
  });
}
