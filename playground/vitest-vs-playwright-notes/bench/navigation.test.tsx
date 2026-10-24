import { test } from "vitest";
import { newBrowserContext, renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { hasHeading, linkTo, seedApp, signIn } from "./app.ts";
import { measure, serverIdle, untilDom } from "./harness.ts";

// A navigation of Next's router: a native `click()` of a `<Link>`, which
// Next handles, until the heading of the target is in the DOM. `server` is
// the Flight request (and in fidelity mode any prefetch that runs at the
// same time), `client` the rest. The speed feature `skipPrefetch` answers every
// prefetch with nothing, so there it always fetches the page as it goes; in
// fidelity mode the router prefetched the links in view while the server
// was idle (warm), unless the click comes right after the page load (cold).

test("navigation to a note and back, prefetches settled", async () => {
  const { notes } = await seedApp();
  await renderServer({ url: "/notes" });
  await serverIdle();
  const noteOf = (i: number) => notes[i % notes.length]!;
  await measure(
    "Navigation › /notes → /notes/[id], prefetches settled",
    async ({ i }) => {
      const note = noteOf(i);
      linkTo(`/notes/${note.id}`).click();
      await untilDom(() => hasHeading(note.title));
    },
    {
      split: true,
      after: async () => {
        linkTo("/notes").click();
        await untilDom(() => hasHeading("Notes"));
      },
    },
  );
  await measure(
    "Navigation › /notes/[id] → /notes, prefetches settled",
    async () => {
      linkTo("/notes").click();
      await untilDom(() => hasHeading("Notes"));
    },
    {
      split: true,
      before: async (i) => {
        const note = noteOf(i);
        linkTo(`/notes/${note.id}`).click();
        await untilDom(() => hasHeading(note.title));
        await serverIdle();
      },
    },
  );
});

test("navigation to a note right after the page load", async () => {
  const { token, notes } = await seedApp();
  const note = notes[0]!;
  await measure(
    "Navigation › /notes → /notes/[id], right after the page load",
    async () => {
      linkTo(`/notes/${note.id}`).click();
      await untilDom(() => hasHeading(note.title));
    },
    {
      split: true,
      before: async () => {
        await newBrowserContext();
        signIn(token);
        await renderServer({ url: "/notes" });
      },
    },
  );
});
