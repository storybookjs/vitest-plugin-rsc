import { expect, test } from "vitest";
import { page } from "dom-locators";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { seedNotes, storedNotes } from "#test/db.ts";
import { expectTitles, signedIn } from "#test/dom-locators.ts";

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
      await page.getByRole("link", { name: "Edit" }).click();
      await page.getByLabelText("Title").fill(title);
      await page.getByLabelText("Content").fill(`Version ${k + 2}`);
      await page.getByRole("button", { name: "Save note" }).click();
      await expect.element(page.getByRole("heading", { name: title })).toBeInTheDocument();
    }
    await page.getByRole("link", { name: "All notes" }).click();

    await expectTitles(["Other", edits.at(-1)!]);
    expect((await storedNotes())[0]).toEqual({
      title: edits.at(-1),
      content: `Version ${edits.length + 1}`,
      favorite: false,
    });
  });
}
