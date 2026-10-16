import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { FavoriteButton } from "../app/components/favorite-button.tsx";
import { db } from "../app/lib/notes.ts";

// A page of Vite that hosts the app without Vitest, for the static build:
// what a test file is to Vitest. It runs in the rsc layer, so the `db` it
// seeds is the one the pages read. Its test opens the build in a browser,
// see build-test/static-build.test.ts.
db.notes.set("7", { id: "7", title: "Seeded by the host", body: "From host/main.tsx" });

// A node of the host, as a test renders one: a Server Component of its own,
// with a Client Component of the app that calls a Server Action.
async function HostNode({ id }: { id: string }) {
  const note = await db.getNote(id);
  return (
    <section>
      <h1>A node of the host</h1>
      <p>{note?.title ?? "No note"}</p>
      <FavoriteButton id={id} favorite={note?.favorite ?? false} />
    </section>
  );
}

type HostResponse = { status: number; url: string; redirected: boolean };
const state = window as {
  __hostState?: string;
  __hostError?: unknown;
  __hostResponse?: HostResponse;
  __hostOpen?: (url: string, node?: string) => Promise<HostResponse>;
};

// Opens a page of the app, the way a test calls `renderServer()`, or renders
// the node with the note `node` at `url`. The tab keeps what the app has
// between the calls: its cookies, its data.
state.__hostOpen = async (url, node) => {
  const { response } = node
    ? await renderServer(<HostNode id={node} />, { url })
    : await renderServer({ url });
  return { status: response.status, url: response.url, redirected: response.redirected };
};

// What the page shows first is in its query: `?url=/notes/7`, or
// `?url=/notes/7&node=7` for the node.
const query = new URLSearchParams(window.location.search);
try {
  state.__hostResponse = await state.__hostOpen(
    query.get("url") ?? "/",
    query.get("node") ?? undefined,
  );
  state.__hostState = "ready";
} catch (error) {
  state.__hostState = "error";
  state.__hostError = error;
  console.error(error);
}
