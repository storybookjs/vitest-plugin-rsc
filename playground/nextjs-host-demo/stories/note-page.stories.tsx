import preview from "../.storybook/preview.ts";
import { db } from "../app/lib/notes.ts";

// A page of the app, in its layouts. The story file is server code, so the
// `db` it seeds is the one the page reads.
const meta = preview.meta({
  title: "Pages/Note",
  parameters: { layout: "fullscreen", nextjs: { url: "/notes/7" } },
  beforeEach() {
    db.notes.set("7", { id: "7", title: "Seeded by the story", body: "From a beforeEach" });
    return () => db.notes.clear();
  },
});

export const Note = meta.story();

export const Home = meta.story({ parameters: { nextjs: { url: "/" } } });
