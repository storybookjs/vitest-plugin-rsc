import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { click, fill } from "#test/user-event.ts";
import { storedNotes } from "#test/db.ts";
import { expectTitles, signedIn } from "#test/vitest.ts";

// Writes one to five notes through the form, one after the other, and finds
// them in the list, newest first.
// Variants 0 to 24 are in flow-create-many-1.test.tsx.
for (let i = 25; i < 50; i++) {
  const titles = Array.from({ length: (i % 5) + 1 }, (_, k) => `Note ${i}.${k}`);
  test(`writes ${titles.length} notes, variant ${i}`, async () => {
    await signedIn();
    await renderServer({ url: "/notes" });

    for (const title of titles) {
      await click(page.getByRole("link", { name: "New note" }));
      await fill(page.getByLabelText("Title"), title);
      await fill(page.getByLabelText("Content"), `Content of ${title}`);
      await click(page.getByRole("button", { name: "Create note" }));
      await expect.element(page.getByText("Note created.")).toBeInTheDocument();
      await click(page.getByRole("link", { name: "All notes" }));
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
