import { expect, test } from "vitest";
import { page } from "dom-locators";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { storedNotes } from "#test/db.ts";
import { expectTitles, signedIn } from "#test/dom-locators.ts";

// Writes one to five notes through the form, one after the other, and finds
// them in the list, newest first.
for (let i = 0; i < 50; i++) {
  const titles = Array.from({ length: (i % 5) + 1 }, (_, k) => `Note ${i}.${k}`);
  test(`writes ${titles.length} notes, variant ${i}`, async () => {
    await signedIn();
    await renderServer({ url: "/notes" });

    for (const title of titles) {
      await page.getByRole("link", { name: "New note" }).click();
      await page.getByLabelText("Title").fill(title);
      await page.getByLabelText("Content").fill(`Content of ${title}`);
      await page.getByRole("button", { name: "Create note" }).click();
      await expect.element(page.getByText("Note created.")).toBeInTheDocument();
      await page.getByRole("link", { name: "All notes" }).click();
    }

    await expectTitles([...titles].reverse());
    await expect
      .element(
        page.getByText(titles.length === 1 ? "1 note" : `${titles.length} notes`, { exact: true }),
      )
      .toBeInTheDocument();
    expect((await storedNotes()).map((note) => note.title)).toEqual(titles);
  });
}
