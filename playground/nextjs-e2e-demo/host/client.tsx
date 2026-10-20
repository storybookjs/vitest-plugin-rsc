import { linkStylesheetsOf, loadClientModule } from "vitest-plugin-rsc/nextjs/testing-library";
import * as counter from "./render-counter.tsx";

// The page of client.html: a file of the host with `"use client"`, and no
// page of the app, as a framework renders a Client Component on its own. It
// also fetches a file of its own from the origin of the app, as a host loads
// what it shows. `pnpm perf:static` measures what such a page waits for. Its
// test is in build-test/static-build.test.ts.
const state = window as { __hostState?: string; __hostError?: unknown; __hostData?: unknown };
try {
  const data = fetch("host.json").then((response) => response.json());
  const { renderCounter } = await loadClientModule(counter);
  await linkStylesheetsOf(counter);
  renderCounter(document.getElementById("host-root")!);
  state.__hostData = await data;
  state.__hostState = "ready";
} catch (error) {
  state.__hostState = "error";
  state.__hostError = error;
  console.error(error);
}
