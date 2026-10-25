import { expect, test } from "./test.ts";
import { storedNotes } from "#test/db.ts";

// Writes one to five notes through the form, one after the other, and finds
// them in the list, newest first.
for (let i = 0; i < 50; i++) {
  const titles = Array.from({ length: (i % 5) + 1 }, (_, k) => `Note ${i}.${k}`);
  test(`writes ${titles.length} notes, variant ${i}`, async ({ page, signedIn, expectTitles }) => {
    const user = await signedIn();
    await page.goto("/notes");

    for (const title of titles) {
      await page.getByRole("link", { name: "New note" }).click();
      await page.getByLabel("Title").fill(title);
      await page.getByLabel("Content").fill(`Content of ${title}`);
      await page.getByRole("button", { name: "Create note" }).click();
      await expect(page.getByText("Note created.")).toBeVisible();
      await page.getByRole("link", { name: "All notes" }).click();
    }

    await expectTitles([...titles].reverse());
    await expect(
      page.getByText(titles.length === 1 ? "1 note" : `${titles.length} notes`, { exact: true }),
    ).toBeVisible();
    expect((await storedNotes(user.id)).map((note) => note.title)).toEqual(titles);
  });
}
