import { test } from "vitest";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { click, expect, fill, screen } from "#test/fast-dom.ts";
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

    await fill(screen.getByLabelText("Title"), first.title);
    await fill(screen.getByLabelText("Content"), first.content);
    await click(screen.getByRole("button", { name: "Create note" }));
    await expect.element(screen.getByText(first.error)).toBeInTheDocument();
    await fill(screen.getByLabelText("Title"), title);
    await fill(screen.getByLabelText("Content"), "Fixed");
    await click(screen.getByRole("button", { name: "Create note" }));
    await expect.element(screen.getByText("Note created.")).toBeInTheDocument();
    await click(screen.getByRole("link", { name: "Edit" }));
    await fill(screen.getByLabelText("Title"), second.title);
    await fill(screen.getByLabelText("Content"), second.content);
    await click(screen.getByRole("button", { name: "Save note" }));
    await expect.element(screen.getByText(second.error)).toBeInTheDocument();
    await fill(screen.getByLabelText("Title"), `${title}, edited`);
    await fill(screen.getByLabelText("Content"), "Fixed again");
    await click(screen.getByRole("button", { name: "Save note" }));

    await expect.element(screen.getByText("Note saved.")).toBeInTheDocument();
    expect(await storedNotes()).toEqual([
      { title: `${title}, edited`, content: "Fixed again", favorite: false },
    ]);
  });
}
