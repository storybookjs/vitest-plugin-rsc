import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { Callout } from "../app/components/callout.tsx";
import { show, state } from "./state.ts";

// A second page of the host, callout.html, from a second file of the host
// that renders a node: as a second story file is to Storybook. The node has
// the CSS of the files the host says render it, `files`, and not of another
// file of the host that the dev server loaded before: see test/host.test.ts.
// Storybook's framework passes the preview file and the story's file the
// same way.
await show(async () => {
  const { response } = await renderServer(<Callout>From the host</Callout>, {
    container: document.getElementById("host-root")!,
    files: ["host/callout.tsx"],
  });
  state.__hostResponse = { status: response.status, url: response.url };
});
