import { expect, test } from "./test.ts";
import { storedNotes } from "#test/db.ts";

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
  test(`recovers from "${first.error}" and "${second.error}", variant ${i}`, async ({
    page,
    signedIn,
  }) => {
    await signedIn();
    await page.goto("/notes/new");

    await page.getByLabel("Title").fill(first.title);
    await page.getByLabel("Content").fill(first.content);
    await page.getByRole("button", { name: "Create note" }).click();
    await expect(page.getByText(first.error)).toBeVisible();
    await page.getByLabel("Title").fill(title);
    await page.getByLabel("Content").fill("Fixed");
    await page.getByRole("button", { name: "Create note" }).click();
    await expect(page.getByText("Note created.")).toBeVisible();
    await page.getByRole("link", { name: "Edit" }).click();
    await page.getByLabel("Title").fill(second.title);
    await page.getByLabel("Content").fill(second.content);
    await page.getByRole("button", { name: "Save note" }).click();
    await expect(page.getByText(second.error)).toBeVisible();
    await page.getByLabel("Title").fill(`${title}, edited`);
    await page.getByLabel("Content").fill("Fixed again");
    await page.getByRole("button", { name: "Save note" }).click();

    await expect(page.getByText("Note saved.")).toBeVisible();
    expect(await storedNotes()).toEqual([
      { title: `${title}, edited`, content: "Fixed again", favorite: false },
    ]);
  });
}
