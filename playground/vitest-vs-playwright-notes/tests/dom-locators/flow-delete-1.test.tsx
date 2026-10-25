import { expect, test } from "vitest";
import { page } from "dom-locators";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { seedNotes, storedNotes } from "#test/db.ts";
import { expectTitles, signedIn } from "#test/dom-locators.ts";

const titles = ["One", "Two", "Three", "Four", "Five"];

// Deletes one to four notes, each from its page, and checks what is left.
// Variants 25 to 49 are in flow-delete-2.test.tsx.
for (let i = 0; i < 25; i++) {
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
      await page.getByRole("link", { name: title, exact: true }).click();
      await page.getByRole("button", { name: "Delete" }).click();
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
