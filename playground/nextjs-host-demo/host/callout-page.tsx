import "./callout-note.tsx";
import { reports } from "host-report";
import { renderCallout } from "./callout.tsx";
import { show, state } from "./state.ts";

// A second page of the host, callout.html, with a node of its own: see
// test/host.test.ts. Its first import is a file with `"use client"`, which
// loads before the page imports the plugin.
await show(async () => {
  const { response } = await renderCallout(document.getElementById("host-root")!);
  state.__hostResponse = { status: response.status, url: response.url };
  state.__hostReports = reports;
});
