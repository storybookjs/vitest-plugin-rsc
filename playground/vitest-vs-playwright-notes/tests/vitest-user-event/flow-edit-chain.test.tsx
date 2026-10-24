import { test } from "vitest";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { click, expect, fill, screen } from "#test/fast-dom.ts";
import { seedNotes, storedNotes } from "#test/db.ts";
import { signedIn } from "#test/vitest.ts";
import { expectTitles } from "#test/fast-dom-notes.ts";

// Edits a note two to four times in a row, from its page, and lists the last
// title.
for (let i = 0; i < 50; i++) {
  const edits = Array.from({ length: (i % 3) + 2 }, (_, k) => `Draft ${i}, version ${k + 2}`);
  test(`edits a note ${edits.length} times, variant ${i}`, async () => {
    const user = await signedIn();
    await seedNotes(user.id, [
      { title: `Draft ${i}`, content: "First version" },
      { title: "Other" },
    ]);
    await renderServer({ url: "/notes/1" });

    for (const [k, title] of edits.entries()) {
      await click(screen.getByRole("link", { name: "Edit" }));
      await fill(screen.getByLabelText("Title"), title);
      await fill(screen.getByLabelText("Content"), `Version ${k + 2}`);
      await click(screen.getByRole("button", { name: "Save note" }));
      await expect.element(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    }
    await click(screen.getByRole("link", { name: "All notes" }));

    await expectTitles(["Other", edits.at(-1)!]);
    expect((await storedNotes())[0]).toEqual({
      title: edits.at(-1),
      content: `Version ${edits.length + 1}`,
      favorite: false,
    });
  });
}
