import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { FavoriteButton } from "../app/components/favorite-button.tsx";
import { NoteCard } from "../app/components/note-card.tsx";
import { db } from "../app/lib/notes.ts";

// A node of the host, as a test renders one: a Server Component of its own,
// with a Server Component of the app that has a CSS module, a Client
// Component of the app that calls a Server Action, and one of the host. That
// one is imported as the node renders: a file of the host with "use client"
// is evaluated in the browser layer before the module that imports it, and
// the page of the host opens a page of the app before that layer has loaded.
async function HostNode({ id }: { id: string }) {
  const note = await db.getNote(id);
  const { HostBadge } = await import("./badge.tsx");
  return (
    <section>
      <h1>A node of the host</h1>
      <NoteCard>{note?.title ?? "No note"}</NoteCard>
      <FavoriteButton id={id} favorite={note?.favorite ?? false} />
      <HostBadge />
    </section>
  );
}

// A file of the host that renders a node, as a story file is to Storybook:
// the node has the CSS of the files the host names, `hostFiles`, which is this
// one. The build lists the stylesheets of every file of the host by its path
// from the root of the project.
export function renderNode(id: string, url: string, hostFiles = ["host/node.tsx"]) {
  return renderServer(<HostNode id={id} />, { url, hostFiles });
}

/** The node of another note, for `rerender()` of what `renderNode()` resolved with. */
export const nodeOf = (id: string) => <HostNode id={id} />;
