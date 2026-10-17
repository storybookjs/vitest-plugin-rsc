import { reports } from "host-report";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { Greeting } from "../app/components/greeting.tsx";
import { show, state } from "./state.ts";

// The host of the app: what a test file is to Vitest, and a story to
// Storybook. It runs in the rsc layer, with the browser's globals, as a test
// file does. What it shows is in its query: `?view=page` for a page of the
// app, `?view=node` for a node in a container of the host, `?view=client` for
// a file of the host with `"use client"`. A second page of the host, with a
// node of its own, is callout.html.
const view = new URLSearchParams(window.location.search).get("view");
await show(async () => {
  if (view === "client") {
    // A client boundary, as in React: the file runs in the browser layer.
    await import("./client.tsx");
    // The report it made, through the page's own `host-report`.
    state.__hostReports = reports;
    return;
  }
  const { response } =
    view === "node"
      ? await renderServer(<Greeting name="the host" />, {
          container: document.getElementById("host-root")!,
        })
      : await renderServer({ url: "/" });
  state.__hostResponse = { status: response.status, url: response.url };
});
