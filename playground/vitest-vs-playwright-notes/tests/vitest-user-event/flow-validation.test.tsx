import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { click, fill } from "#test/user-event.ts";
import { storedNotes } from "#test/db.ts";
import { signedIn } from "#test/vitest.ts";

const invalid = [
  { title: "", content: "", error: "Title is required." },
  { title: "   ", content: "Body", error: "Title is required." },
  { title: "x".repeat(101), content: "", error: "Title is at most 100 characters." },
  { title: "Fine", content: "y".repeat(2001), error: "Content is at most 2000 characters." },
  { title: "x".repeat(150), content: "Long title", error: "Title is at most 100 characters." },
];

// Submits an invalid note, fixes it, then breaks it in the edit form and
// fixes it again.
for (let i = 0; i < 50; i++) {
  const first = invalid[i % 5]!;
  const second = invalid[(i + 2) % 5]!;
  const title = `Valid note ${i}`;
  test(`recovers from "${first.error}" and "${second.error}", variant ${i}`, async () => {
    await signedIn();
    await renderServer({ url: "/notes/new" });

    await fill(page.getByLabelText("Title"), first.title);
    await fill(page.getByLabelText("Content"), first.content);
    await click(page.getByRole("button", { name: "Create note" }));
    await expect.element(page.getByText(first.error)).toBeInTheDocument();
    await fill(page.getByLabelText("Title"), title);
    await fill(page.getByLabelText("Content"), "Fixed");
    await click(page.getByRole("button", { name: "Create note" }));
    await expect.element(page.getByText("Note created.")).toBeInTheDocument();
    await click(page.getByRole("link", { name: "Edit" }));
    await fill(page.getByLabelText("Title"), second.title);
    await fill(page.getByLabelText("Content"), second.content);
    await click(page.getByRole("button", { name: "Save note" }));
    await expect.element(page.getByText(second.error)).toBeInTheDocument();
    await fill(page.getByLabelText("Title"), `${title}, edited`);
    await fill(page.getByLabelText("Content"), "Fixed again");
    await click(page.getByRole("button", { name: "Save note" }));

    await expect.element(page.getByText("Note saved.")).toBeInTheDocument();
    expect(await storedNotes()).toEqual([
      { title: `${title}, edited`, content: "Fixed again", favorite: false },
    ]);
  });
}
