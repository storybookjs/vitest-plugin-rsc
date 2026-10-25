import { expect, test } from "vitest";
import { page } from "dom-locators";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { seedNotes } from "#test/db.ts";
import { expectTitles, signedIn } from "#test/dom-locators.ts";

const notes = [
  { title: "Groceries", content: "Oat milk, bread, cheese" },
  { title: "Reading list", content: "Shape Up, The Pragmatic Programmer" },
  { title: "Milk tasting", content: "Notes from the farm" },
  { title: "Garden", content: "Tomatoes, basil, more cheese" },
  { title: "Holiday", content: "Bread from the bakery by the farm" },
  { title: "Ideas", content: "A shape for the garden" },
];
const words = ["milk", "cheese", "farm", "shape", "bread", "garden", "pizza", "the"];

function matches(word: string) {
  return notes
    .filter((note) => `${note.title} ${note.content}`.toLowerCase().includes(word))
    .map((note) => note.title)
    .reverse();
}

// Searches three times in a row with the form, and opens the first result.
for (let i = 0; i < 50; i++) {
  const queries = [words[i % 8]!, words[(i + 3) % 8]!, words[(i + 5) % 8]!];
  test(`searches ${queries.join(", ")}, variant ${i}`, async () => {
    const user = await signedIn();
    await seedNotes(user.id, notes);
    await renderServer({ url: "/notes" });

    for (const query of queries) {
      await page.getByLabelText("Search").fill(query);
      await page.getByRole("button", { name: "Search" }).click();
      const found = matches(query);
      // The page of this search: the results of two can be the same.
      const count = found.length === 1 ? "1 result" : `${found.length} results`;
      await expect.element(page.getByText(`${count} for “${query}”`)).toBeInTheDocument();
      if (found.length) await expectTitles(found);
      else await expect.element(page.getByText(`No notes match “${query}”.`)).toBeInTheDocument();
    }
    const last = matches(queries.at(-1)!);
    if (last.length) {
      await page.getByRole("link", { name: last[0], exact: true }).click();
      await expect.element(page.getByRole("heading", { name: last[0] })).toBeInTheDocument();
    }
  });
}
