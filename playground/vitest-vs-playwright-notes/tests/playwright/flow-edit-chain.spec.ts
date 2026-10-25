import { expect, test } from "./test.ts";
import { seedNotes, storedNotes } from "#test/db.ts";

// Edits a note two to four times in a row, from its page, and lists the last
// title.
for (let i = 0; i < 50; i++) {
  const edits = Array.from({ length: (i % 3) + 2 }, (_, k) => `Draft ${i}, version ${k + 2}`);
  test(`edits a note ${edits.length} times, variant ${i}`, async ({
    page,
    signedIn,
    expectTitles,
  }) => {
    const user = await signedIn();
    const [draft] = await seedNotes(user.id, [
      { title: `Draft ${i}`, content: "First version" },
      { title: "Other" },
    ]);
    await page.goto(`/notes/${draft!.id}`);

    for (const [k, title] of edits.entries()) {
      await page.getByRole("link", { name: "Edit" }).click();
      await page.getByLabel("Title").fill(title);
      await page.getByLabel("Content").fill(`Version ${k + 2}`);
      await page.getByRole("button", { name: "Save note" }).click();
      await expect(page.getByRole("heading", { name: title })).toBeVisible();
    }
    await page.getByRole("link", { name: "All notes" }).click();

    await expectTitles(["Other", edits.at(-1)!]);
    expect((await storedNotes(user.id))[0]).toEqual({
      title: edits.at(-1),
      content: `Version ${edits.length + 1}`,
      favorite: false,
    });
  });
}
