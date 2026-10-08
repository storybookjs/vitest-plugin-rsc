import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { Greeting } from "../app/components/greeting.tsx";
import { db } from "../app/lib/notes.ts";

// The host of the app: what a test file is to Vitest, and a story to
// Storybook. It runs in the rsc layer, so the `db` it seeds is the one the
// pages read.
db.notes.set("7", { id: "7", title: "Seeded by the host", body: "From host/main.tsx" });

const views: Record<string, () => Promise<unknown>> = {
  home: () => renderServer({ url: "/" }),
  note: () => renderServer({ url: "/notes/7" }),
  node: () =>
    renderServer(<Greeting name="the host" />, {
      url: "/notes/7",
      container: document.getElementById("host-root")!,
    }),
};

const view = new URLSearchParams(window.location.search).get("view") ?? "home";
const state = window as { __hostState?: string; __hostError?: unknown };
try {
  await views[view]!();
  state.__hostState = "ready";
} catch (error) {
  state.__hostState = "error";
  state.__hostError = error;
  console.error(error);
}
