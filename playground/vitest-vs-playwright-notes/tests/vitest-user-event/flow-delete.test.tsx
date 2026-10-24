import { test } from "vitest";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { click, expect, screen } from "#test/fast-dom.ts";
import { seedNotes, storedNotes } from "#test/db.ts";
import { signedIn } from "#test/vitest.ts";
import { expectTitles } from "#test/fast-dom-notes.ts";

const titles = ["One", "Two", "Three", "Four", "Five"];

// Deletes one to four notes, each from its page, and checks what is left.
for (let i = 0; i < 50; i++) {
  const doomed = titles.filter((_, k) => (k + i) % 5 < (i % 4) + 1);
  const left = titles.filter((title) => !doomed.includes(title));
  test(`deletes ${doomed.join(", ")}, variant ${i}`, async () => {
    const user = await signedIn();
    await seedNotes(
      user.id,
      titles.map((title) => ({ title })),
    );
    await renderServer({ url: "/notes" });

    for (const title of doomed) {
      await click(screen.getByRole("link", { name: title }));
      await click(screen.getByRole("button", { name: "Delete" }));
      await expect.element(screen.getByText("Note deleted.")).toBeInTheDocument();
    }

    await expectTitles([...left].reverse());
    await expect
      .element(screen.getByText(left.length === 1 ? "1 note" : `${left.length} notes`))
      .toBeInTheDocument();
    expect((await storedNotes()).map((note) => note.title)).toEqual(left);
  });
}
