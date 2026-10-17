import { reports } from "host-report";
import { cleanup, renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { renderCallout } from "./callout.tsx";
import { renderGreeting } from "./greeting.tsx";
import { show, state } from "./state.ts";

// The host of the app: what a test file is to Vitest, and a story to
// Storybook. It runs in the rsc layer, with the browser's globals, as a test
// file does. What it shows is in its query: `?view=page` for a page of the
// app, `?view=node` for a node in a container of the host, `?view=switch`
// for one node after another in the one document, as Storybook's canvas
// renders story after story, `?view=client` for a file of the host with
// `"use client"`. A second page of the host, with a node of its own, is
// callout.html.
const view = new URLSearchParams(window.location.search).get("view");
await show(async () => {
  if (view === "client") {
    // A client boundary, as in React: the file runs in the browser layer.
    await import("./client.tsx");
    // The report it made, through the page's own `host-report`.
    state.__hostReports = reports;
    return;
  }
  const container = document.getElementById("host-root")!;
  if (view === "switch") {
    // The first node, with its stylesheet, and then `cleanup()`, as Vitest
    // runs it between tests and Storybook's framework will between stories.
    // The next `renderServer()` would leave the first node by itself too.
    await renderCallout(container);
    state.__hostCalloutLinked =
      document.querySelector("link[rel=stylesheet][href*='callout.module.css']") !== null;
    await cleanup();
  }
  const { response } =
    view === "node" || view === "switch"
      ? await renderGreeting(container)
      : await renderServer({ url: "/" });
  state.__hostResponse = { status: response.status, url: response.url };
});
