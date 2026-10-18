import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { db } from "../app/lib/notes.ts";
import { nodeOf, renderNode } from "./node.tsx";

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
  __hostOpen?: (url: string, node?: string, files?: string[]) => Promise<HostResponse>;
  __hostRerender?: (node: string) => Promise<void>;
};

// Opens a page of the app, the way a test calls `renderServer()`, or renders
// the node with the note `node` at `url`, from host/node.tsx, with the files
// of the host that render it, `hostFiles`. The tab keeps what the app has
// between the calls: its cookies, its data.
state.__hostOpen = async (url, node, files) => {
  if (!node) {
    const { response } = await renderServer({ url });
    state.__hostRerender = undefined;
    return { status: response.status, url: response.url, redirected: response.redirected };
  }
  const { response, rerender } = await renderNode(node, url, files);
  // Renders the node of another note in its place, without a page load.
  state.__hostRerender = (id) => rerender(nodeOf(id));
  return { status: response.status, url: response.url, redirected: response.redirected };
};

// What the page shows first is in its query: `?url=/notes/7`, or
// `?url=/notes/7&node=7` for the node, with `&file=…` for each of its files.
const query = new URLSearchParams(window.location.search);
try {
  state.__hostResponse = await state.__hostOpen(
    query.get("url") ?? "/",
    query.get("node") ?? undefined,
    query.has("file") ? query.getAll("file") : undefined,
  );
  state.__hostState = "ready";
} catch (error) {
  state.__hostState = "error";
  state.__hostError = error;
  console.error(error);
}
