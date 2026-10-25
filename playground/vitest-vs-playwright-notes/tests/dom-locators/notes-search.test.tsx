import { expect } from "vitest";
import { page } from "dom-locators";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { createUser, seedNotes } from "#test/db.ts";
import { expectTitles, signedIn, test } from "#test/dom-locators.ts";

const notes = [
  { title: "Groceries", content: "Oat milk, bread, cheese" },
  { title: "Reading list", content: "Shape Up, The Pragmatic Programmer" },
  { title: "Milk tasting", content: "Notes from the farm" },
];

test("finds notes by title", async () => {
  const user = await signedIn();
  await seedNotes(user.id, notes);
  await renderServer({ url: "/notes?q=reading" });

  await expectTitles(["Reading list"]);
});

test("finds notes by content", async () => {
  const user = await signedIn();
  await seedNotes(user.id, notes);
  await renderServer({ url: "/notes?q=pragmatic" });

  await expectTitles(["Reading list"]);
});

test("finds notes by title and content at once", async () => {
  const user = await signedIn();
  await seedNotes(user.id, notes);
  await renderServer({ url: "/notes?q=milk" });

  await expectTitles(["Milk tasting", "Groceries"]);
});

test("says so when no note matches", async () => {
  const user = await signedIn();
  await seedNotes(user.id, notes);
  await renderServer({ url: "/notes?q=pizza" });

  await expect.element(page.getByText("No notes match “pizza”.")).toBeInTheDocument();
});

test("keeps the query in the search box", async () => {
  const user = await signedIn();
  await seedNotes(user.id, notes);
  await renderServer({ url: "/notes?q=milk" });

  await expect.element(page.getByLabelText("Search")).toHaveValue("milk");
});

test("searches with the form", async () => {
  const user = await signedIn();
  await seedNotes(user.id, notes);
  await renderServer({ url: "/notes" });

  await page.getByLabelText("Search").fill("bread");
  await page.getByRole("button", { name: "Search" }).click();

  await expectTitles(["Groceries"]);
});

test("lists every note for an empty query", async () => {
  const user = await signedIn();
  await seedNotes(user.id, notes);
  await renderServer({ url: "/notes?q=" });

  await expectTitles(["Milk tasting", "Reading list", "Groceries"]);
});

test("trims the query", async () => {
  const user = await signedIn();
  await seedNotes(user.id, notes);
  await renderServer({ url: "/notes?q=%20%20cheese%20%20" });

  await expectTitles(["Groceries"]);
  await expect.element(page.getByLabelText("Search")).toHaveValue("cheese");
});

test("does not find the notes of other users", async ({ people }) => {
  const user = await signedIn();
  const other = await createUser(people.grace);
  await seedNotes(user.id, notes);
  await seedNotes(other.id, [{ title: "Grace's milk" }]);
  await renderServer({ url: "/notes?q=milk" });

  await expectTitles(["Milk tasting", "Groceries"]);
});

test("keeps the count of every note while searching", async () => {
  const user = await signedIn();
  await seedNotes(user.id, notes);
  await renderServer({ url: "/notes?q=reading" });

  await expect.element(page.getByText("3 notes")).toBeInTheDocument();
});
