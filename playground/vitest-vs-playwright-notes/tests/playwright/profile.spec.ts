import { expect, test } from "./test.ts";
import { createUser, seedNotes, storedUser } from "#test/db.ts";

test("shows the email of the user", async ({ page, signedIn }) => {
  const user = await signedIn();
  await page.goto("/profile");

  await expect(page.getByRole("heading", { name: "Profile" })).toBeVisible();
  await expect(page.getByText(`Email: ${user.email}`)).toBeVisible();
});

test("counts no notes", async ({ page, signedIn }) => {
  await signedIn();
  await page.goto("/profile");

  await expect(page.getByText("You have 0 notes.")).toBeVisible();
});

test("counts one note", async ({ page, signedIn }) => {
  const user = await signedIn();
  await seedNotes(user.id, [{ title: "Groceries" }]);
  await page.goto("/profile");

  await expect(page.getByText("You have 1 note.")).toBeVisible();
});

test("fills in the name", async ({ page, signedIn }) => {
  await signedIn();
  await page.goto("/profile");

  await expect(page.getByLabel("Name")).toHaveValue("Ada Lovelace");
});

test("saves the name", async ({ page, signedIn }) => {
  await signedIn();
  await page.goto("/profile");

  await page.getByLabel("Name").fill("Ada King");
  await page.getByRole("button", { name: "Save name" }).click();

  await expect(page.getByText("Name saved.")).toBeVisible();
  await expect(page.getByText("Signed in as Ada King")).toBeVisible();
});

test("stores the name", async ({ page, signedIn }) => {
  const user = await signedIn();
  await page.goto("/profile");

  await page.getByLabel("Name").fill("Ada King");
  await page.getByRole("button", { name: "Save name" }).click();

  await expect(page.getByText("Name saved.")).toBeVisible();
  expect((await storedUser(user.email))?.name).toBe("Ada King");
});

test("requires a name", async ({ page, signedIn }) => {
  const user = await signedIn();
  await page.goto("/profile");

  await page.getByLabel("Name").fill("");
  await page.getByRole("button", { name: "Save name" }).click();

  await expect(page.getByText("Name is required.")).toBeVisible();
  expect((await storedUser(user.email))?.name).toBe("Ada Lovelace");
});

test("trims the name", async ({ page, signedIn }) => {
  const user = await signedIn();
  await page.goto("/profile");

  await page.getByLabel("Name").fill("  Ada King  ");
  await page.getByRole("button", { name: "Save name" }).click();

  await expect(page.getByText("Signed in as Ada King")).toBeVisible();
  expect((await storedUser(user.email))?.name).toBe("Ada King");
});

test("opens from the header of the notes", async ({ page, signedIn }) => {
  const user = await signedIn();
  await page.goto("/notes");

  await page.getByRole("link", { name: "Profile" }).click();

  await expect(page.getByText(`Email: ${user.email}`)).toBeVisible();
});

test("shows the user that is signed in, not another", async ({ page, people, signedIn }) => {
  await createUser(people.grace);
  const user = await signedIn();
  await page.goto("/profile");

  await expect(page.getByText(`Email: ${user.email}`)).toBeVisible();
  await expect(page.getByText(`Email: ${people.grace.email}`)).toHaveCount(0);
});
