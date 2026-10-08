import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { Greeting } from "../app/components/greeting.tsx";
import { db } from "../app/lib/notes.ts";

// The host of the app: what a test file is to Vitest, and a story to
// Storybook. It runs in the rsc layer, so the `db` it seeds is the one the
// pages read.
db.notes.set("7", { id: "7", title: "Seeded by the host", body: "From host/main.tsx" });

// What the page shows is in its query: `?url=/notes/7` for a page of the app,
// and `?view=node` for a node in a container of the host.
const query = new URLSearchParams(window.location.search);
const state = window as {
  __hostState?: string;
  __hostError?: unknown;
  __hostResponse?: { status: number; url: string; redirected: boolean };
};
try {
  const { response } =
    query.get("view") === "node"
      ? await renderServer(<Greeting name="the host" />, {
          url: "/notes/7",
          container: document.getElementById("host-root")!,
        })
      : await renderServer({ url: query.get("url") ?? "/" });
  state.__hostResponse = {
    status: response.status,
    url: response.url,
    redirected: response.redirected,
  };
  state.__hostState = "ready";
} catch (error) {
  state.__hostState = "error";
  state.__hostError = error;
  console.error(error);
}
