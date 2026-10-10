import { cleanup, renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { Greeting } from "../app/components/greeting.tsx";
import { db } from "../app/lib/notes.ts";
import { signIn } from "./session.ts";

// The host of the app: what a test file is to Vitest, and a story to
// Storybook. It runs in the rsc layer, so the `db` it seeds is the one the
// pages read.
db.notes.set("7", { id: "7", title: "Seeded by the host", body: "From host/main.tsx" });

// What the page shows is in its query: `?url=/notes/7` for a page of the app,
// `?view=node` for a node in a container of the host, `?view=storage` for
// what `cleanup()` leaves of the browser's storage and cookies, and
// `?user=none` for a visitor who is not signed in.
const query = new URLSearchParams(window.location.search);
signIn(query.get("user") === "none" ? undefined : "Ada");
const state = window as {
  __hostState?: string;
  __hostError?: unknown;
  __hostResponse?: { status: number; url: string; redirected: boolean };
  __hostStorage?: { keys: string[]; cookie: string };
};
try {
  if (query.get("view") === "storage") {
    // What the host stores, with no page of the app open, and what is stored
    // while one is.
    localStorage.setItem("host-setting", "kept");
    document.cookie = "host-cookie=kept; path=/";
    await renderServer({ url: "/" });
    localStorage.setItem("app-setting", "gone");
    document.cookie = "app-cookie=gone; path=/";
    await cleanup();
    state.__hostStorage = { keys: Object.keys(localStorage).sort(), cookie: document.cookie };
  }
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
