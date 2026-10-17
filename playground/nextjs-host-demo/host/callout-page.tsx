import { renderCallout } from "./callout.tsx";
import { show, state } from "./state.ts";

// A second page of the host, callout.html, with a node of its own: see
// test/host.test.ts.
await show(async () => {
  const { response } = await renderCallout(document.getElementById("host-root")!);
  state.__hostResponse = { status: response.status, url: response.url };
});
