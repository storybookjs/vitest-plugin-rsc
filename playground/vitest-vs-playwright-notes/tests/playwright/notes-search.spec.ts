import { expect, test } from "./test.ts";
import { createUser, grace, seedNotes } from "#test/db.ts";

const notes = [
  { title: "Groceries", content: "Oat milk, bread, cheese" },
  { title: "Reading list", content: "Shape Up, The Pragmatic Programmer" },
  { title: "Milk tasting", content: "Notes from the farm" },
];

test("finds notes by title", async ({ page, signedIn, expectTitles }) => {
  const user = await signedIn();
  await seedNotes(user.id, notes);
  await page.goto("/notes?q=reading");

  await expectTitles(["Reading list"]);
});

test("finds notes by content", async ({ page, signedIn, expectTitles }) => {
  const user = await signedIn();
  await seedNotes(user.id, notes);
  await page.goto("/notes?q=pragmatic");

  await expectTitles(["Reading list"]);
});

test("finds notes by title and content at once", async ({ page, signedIn, expectTitles }) => {
  const user = await signedIn();
  await seedNotes(user.id, notes);
  await page.goto("/notes?q=milk");

  await expectTitles(["Milk tasting", "Groceries"]);
});

test("says so when no note matches", async ({ page, signedIn }) => {
  const user = await signedIn();
  await seedNotes(user.id, notes);
  await page.goto("/notes?q=pizza");

  await expect(page.getByText("No notes match “pizza”.")).toBeVisible();
});

test("keeps the query in the search box", async ({ page, signedIn }) => {
  const user = await signedIn();
  await seedNotes(user.id, notes);
  await page.goto("/notes?q=milk");

  await expect(page.getByLabel("Search")).toHaveValue("milk");
});

test("searches with the form", async ({ page, signedIn, expectTitles }) => {
  const user = await signedIn();
  await seedNotes(user.id, notes);
  await page.goto("/notes");

  await page.getByLabel("Search").fill("bread");
  await page.getByRole("button", { name: "Search" }).click();

  await expectTitles(["Groceries"]);
});

test("lists every note for an empty query", async ({ page, signedIn, expectTitles }) => {
  const user = await signedIn();
  await seedNotes(user.id, notes);
  await page.goto("/notes?q=");

  await expectTitles(["Milk tasting", "Reading list", "Groceries"]);
});

test("trims the query", async ({ page, signedIn, expectTitles }) => {
  const user = await signedIn();
  await seedNotes(user.id, notes);
  await page.goto("/notes?q=%20%20cheese%20%20");

  await expectTitles(["Groceries"]);
  await expect(page.getByLabel("Search")).toHaveValue("cheese");
});

test("does not find the notes of other users", async ({ page, signedIn, expectTitles }) => {
  const user = await signedIn();
  const other = await createUser(grace);
  await seedNotes(user.id, notes);
  await seedNotes(other.id, [{ title: "Grace's milk" }]);
  await page.goto("/notes?q=milk");

  await expectTitles(["Milk tasting", "Groceries"]);
});

test("keeps the count of every note while searching", async ({ page, signedIn }) => {
  const user = await signedIn();
  await seedNotes(user.id, notes);
  await page.goto("/notes?q=reading");

  await expect(page.getByText("3 notes")).toBeVisible();
});
