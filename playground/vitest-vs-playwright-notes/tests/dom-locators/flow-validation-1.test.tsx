import { expect, test } from "vitest";
import { page } from "dom-locators";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { storedNotes } from "#test/db.ts";
import { signedIn } from "#test/dom-locators.ts";

const invalid = [
  { title: "", content: "", error: "Title is required." },
  { title: "   ", content: "Body", error: "Title is required." },
  { title: "x".repeat(101), content: "", error: "Title is at most 100 characters." },
  { title: "Fine", content: "y".repeat(2001), error: "Content is at most 2000 characters." },
  { title: "x".repeat(150), content: "Long title", error: "Title is at most 100 characters." },
];

// Submits an invalid note, fixes it, then breaks it in the edit form and
// fixes it again.
// Variants 25 to 49 are in flow-validation-2.test.tsx.
for (let i = 0; i < 25; i++) {
  const first = invalid[i % 5]!;
  const second = invalid[(i + 2) % 5]!;
  const title = `Valid note ${i}`;
  test(`recovers from "${first.error}" and "${second.error}", variant ${i}`, async () => {
    await signedIn();
    await renderServer({ url: "/notes/new" });

    await page.getByLabelText("Title").fill(first.title);
    await page.getByLabelText("Content").fill(first.content);
    await page.getByRole("button", { name: "Create note" }).click();
    await expect.element(page.getByText(first.error)).toBeInTheDocument();
    await page.getByLabelText("Title").fill(title);
    await page.getByLabelText("Content").fill("Fixed");
    await page.getByRole("button", { name: "Create note" }).click();
    await expect.element(page.getByText("Note created.")).toBeInTheDocument();
    await page.getByRole("link", { name: "Edit" }).click();
    await page.getByLabelText("Title").fill(second.title);
    await page.getByLabelText("Content").fill(second.content);
    await page.getByRole("button", { name: "Save note" }).click();
    await expect.element(page.getByText(second.error)).toBeInTheDocument();
    await page.getByLabelText("Title").fill(`${title}, edited`);
    await page.getByLabelText("Content").fill("Fixed again");
    await page.getByRole("button", { name: "Save note" }).click();

    await expect.element(page.getByText("Note saved.")).toBeInTheDocument();
    expect(await storedNotes()).toEqual([
      { title: `${title}, edited`, content: "Fixed again", favorite: false },
    ]);
  });
}
