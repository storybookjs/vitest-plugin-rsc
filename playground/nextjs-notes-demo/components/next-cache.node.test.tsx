import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { NextCacheProbe, resetNextCacheProbe } from "./next-cache-probe.tsx";

// A `fetch` of a Server Component reaches MSW's server in the node projects
// of vitest.config.ts, which vitest.setup.node.ts starts after the page has
// loaded: the server's `fetch` is the worker's global as it is called. With
// happy-dom, whose window is a realm of its own. jsdom's window is the
// worker's global, whose `fetch` is the page's: there the server keeps
// Node's from before MSW. In the layouts of `/`: see async-context.node.test.tsx.
const happyDom = "happyDOM" in window;

test.runIf(happyDom)("a fetch of the server is answered by MSW's server", async () => {
  resetNextCacheProbe();
  await renderServer(<NextCacheProbe />, { layouts: true });

  await expect.element(page.getByText("cached fetch: default fetch 1")).toBeVisible();
  await expect.element(page.getByText("no-store fetch: default no-store fetch 1")).toBeVisible();
});
