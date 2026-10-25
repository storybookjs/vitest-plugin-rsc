import { expect, test } from "./test.ts";
import { seedNotes, storedNotes } from "#test/db.ts";

const titles = ["One", "Two", "Three", "Four", "Five"];

// Deletes one to four notes, each from its page, and checks what is left.
// Variants 0 to 24 are in flow-delete-1.spec.ts.
for (let i = 25; i < 50; i++) {
  const doomed = titles.filter((_, k) => (k + i) % 5 < (i % 4) + 1);
  const left = titles.filter((title) => !doomed.includes(title));
  test(`deletes ${doomed.join(", ")}, variant ${i}`, async ({ page, signedIn, expectTitles }) => {
    const user = await signedIn();
    await seedNotes(
      user.id,
      titles.map((title) => ({ title })),
    );
    await page.goto("/notes");

    for (const title of doomed) {
      await page.getByRole("link", { name: title, exact: true }).click();
      await page.getByRole("button", { name: "Delete" }).click();
      await expect(page.getByText("Note deleted.")).toBeVisible();
    }

    await expectTitles([...left].reverse());
    await expect(
      page.getByText(left.length === 1 ? "1 note" : `${left.length} notes`, { exact: true }),
    ).toBeVisible();
    expect((await storedNotes()).map((note) => note.title)).toEqual(left);
  });
}
