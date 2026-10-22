import { expect, test } from "./test.ts";
import { seedNotes, storedNotes } from "#test/db.ts";

const titles = ["Alpha", "Bravo", "Charlie", "Delta"];

// Favorites a different set of notes from the list, each from its own page,
// and checks the order of the list: favorites first, newest first.
for (let i = 0; i < 50; i++) {
  const favorites = titles.filter((_, k) => ((i + 1) >> k) & 1);
  if (favorites.length === 0) favorites.push("Bravo");
  test(`favorites ${favorites.join(", ")}, variant ${i}`, async ({
    page,
    signedIn,
    expectTitles,
  }) => {
    const user = await signedIn();
    await seedNotes(
      user.id,
      titles.map((title) => ({ title })),
    );
    await page.goto("/notes");

    for (const title of favorites) {
      await page.getByRole("link", { name: title, exact: true }).click();
      await page.getByRole("button", { name: "Favorite", exact: true }).click();
      await expect(page.getByRole("button", { name: "Unfavorite" })).toBeVisible();
      await page.getByRole("link", { name: "All notes" }).click();
    }

    const newestFirst = [...titles].reverse();
    await expectTitles([
      ...newestFirst.filter((title) => favorites.includes(title)),
      ...newestFirst.filter((title) => !favorites.includes(title)),
    ]);
    expect((await storedNotes()).filter((note) => note.favorite).map((note) => note.title)).toEqual(
      titles.filter((title) => favorites.includes(title)),
    );
  });
}
