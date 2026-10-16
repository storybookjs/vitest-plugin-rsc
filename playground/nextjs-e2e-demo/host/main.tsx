import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { db } from "../app/lib/notes.ts";

// A page of Vite that hosts the app without Vitest, for the static build:
// what a test file is to Vitest. It runs in the rsc layer, so the `db` it
// seeds is the one the pages read. Its test opens the build in a browser,
// see build-test/static-build.test.ts.
db.notes.set("7", { id: "7", title: "Seeded by the host", body: "From host/main.tsx" });

type HostResponse = { status: number; url: string; redirected: boolean };
const state = window as {
  __hostState?: string;
  __hostError?: unknown;
  __hostResponse?: HostResponse;
  __hostOpen?: (url: string) => Promise<HostResponse>;
};

// Opens a page of the app, the way a test calls `renderServer()`. The tab
// keeps what the app has between the calls: its cookies, its data.
state.__hostOpen = async (url) => {
  const { response } = await renderServer({ url });
  return { status: response.status, url: response.url, redirected: response.redirected };
};

// What the page shows first is in its query: `?url=/notes/7`.
const query = new URLSearchParams(window.location.search);
try {
  state.__hostResponse = await state.__hostOpen(query.get("url") ?? "/");
  state.__hostState = "ready";
} catch (error) {
  state.__hostState = "error";
  state.__hostError = error;
  console.error(error);
}
