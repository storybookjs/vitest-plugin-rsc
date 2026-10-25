import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { click, fill } from "#test/user-event.ts";
import { seedNotes, storedNotes } from "#test/db.ts";
import { expectTitles, signedIn } from "#test/vitest.ts";

// Edits a note two to four times in a row, from its page, and lists the last
// title.
// Variants 25 to 49 are in flow-edit-chain-2.test.tsx.
for (let i = 0; i < 25; i++) {
  const edits = Array.from({ length: (i % 3) + 2 }, (_, k) => `Draft ${i}, version ${k + 2}`);
  test(`edits a note ${edits.length} times, variant ${i}`, async () => {
    const user = await signedIn();
    await seedNotes(user.id, [
      { title: `Draft ${i}`, content: "First version" },
      { title: "Other" },
    ]);
    await renderServer({ url: "/notes/1" });

    for (const [k, title] of edits.entries()) {
      await click(page.getByRole("link", { name: "Edit" }));
      await fill(page.getByLabelText("Title"), title);
      await fill(page.getByLabelText("Content"), `Version ${k + 2}`);
      await click(page.getByRole("button", { name: "Save note" }));
      await expect.element(page.getByRole("heading", { name: title })).toBeInTheDocument();
    }
    await click(page.getByRole("link", { name: "All notes" }));

    await expectTitles(["Other", edits.at(-1)!]);
    expect((await storedNotes())[0]).toEqual({
      title: edits.at(-1),
      content: `Version ${edits.length + 1}`,
      favorite: false,
    });
  });
}
