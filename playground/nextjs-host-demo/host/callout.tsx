import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { Callout } from "../app/components/callout.tsx";
import { show, state } from "./state.ts";

// A second page of the host, callout.html, from a second file of the host
// that renders a node: as a second story file is to Storybook, in an iframe
// of its own. A page that loads this file gets the CSS of its node; a page
// that loads another file of the host does not, though the dev server has
// loaded this one before: see test/host.test.ts.
await show(async () => {
  const { response } = await renderServer(<Callout>From the host</Callout>, {
    container: document.getElementById("host-root")!,
  });
  state.__hostResponse = { status: response.status, url: response.url };
});
