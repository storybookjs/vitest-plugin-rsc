import { test } from "vitest";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { click, expect, fill, screen } from "#test/fast-dom.ts";
import { storedNotes } from "#test/db.ts";
import { signedIn } from "#test/vitest.ts";
import { expectTitles } from "#test/fast-dom-notes.ts";

// Writes one to five notes through the form, one after the other, and finds
// them in the list, newest first.
for (let i = 0; i < 50; i++) {
  const titles = Array.from({ length: (i % 5) + 1 }, (_, k) => `Note ${i}.${k}`);
  test(`writes ${titles.length} notes, variant ${i}`, async () => {
    await signedIn();
    await renderServer({ url: "/notes" });

    for (const title of titles) {
      await click(screen.getByRole("link", { name: "New note" }));
      await fill(screen.getByLabelText("Title"), title);
      await fill(screen.getByLabelText("Content"), `Content of ${title}`);
      await click(screen.getByRole("button", { name: "Create note" }));
      await expect.element(screen.getByText("Note created.")).toBeInTheDocument();
      await click(screen.getByRole("link", { name: "All notes" }));
    }

    await expectTitles([...titles].reverse());
    await expect
      .element(screen.getByText(titles.length === 1 ? "1 note" : `${titles.length} notes`))
      .toBeInTheDocument();
    expect((await storedNotes()).map((note) => note.title)).toEqual(titles);
  });
}
