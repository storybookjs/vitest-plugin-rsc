import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { click } from "#test/user-event.ts";
import { seedNotes, storedNotes } from "#test/db.ts";
import { expectTitles, signedIn } from "#test/vitest.ts";

const titles = ["One", "Two", "Three", "Four", "Five"];

// Deletes one to four notes, each from its page, and checks what is left.
// Variants 0 to 24 are in flow-delete-1.test.tsx.
for (let i = 25; i < 50; i++) {
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
      await click(page.getByRole("link", { name: title, exact: true }));
      await click(page.getByRole("button", { name: "Delete" }));
      await expect.element(page.getByText("Note deleted.")).toBeInTheDocument();
    }

    await expectTitles([...left].reverse());
    await expect
      .element(
        page.getByText(left.length === 1 ? "1 note" : `${left.length} notes`, { exact: true }),
      )
      .toBeInTheDocument();
    expect((await storedNotes()).map((note) => note.title)).toEqual(left);
  });
}
