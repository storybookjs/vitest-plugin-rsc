import { expect, test } from "vitest";
import { page } from "dom-locators";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { createUser, grace, seedNotes, storedUser } from "#test/db.ts";
import { signedIn } from "#test/dom-locators.ts";

test("shows the email of the user", async () => {
  await signedIn();
  await renderServer({ url: "/profile" });

  await expect.element(page.getByRole("heading", { name: "Profile" })).toBeInTheDocument();
  await expect.element(page.getByText("Email: ada@example.com")).toBeInTheDocument();
});

test("counts no notes", async () => {
  await signedIn();
  await renderServer({ url: "/profile" });

  await expect.element(page.getByText("You have 0 notes.")).toBeInTheDocument();
});

test("counts one note", async () => {
  const user = await signedIn();
  await seedNotes(user.id, [{ title: "Groceries" }]);
  await renderServer({ url: "/profile" });

  await expect.element(page.getByText("You have 1 note.")).toBeInTheDocument();
});

test("fills in the name", async () => {
  await signedIn();
  await renderServer({ url: "/profile" });

  await expect.element(page.getByLabelText("Name")).toHaveValue("Ada Lovelace");
});

test("saves the name", async () => {
  await signedIn();
  await renderServer({ url: "/profile" });

  await page.getByLabelText("Name").fill("Ada King");
  await page.getByRole("button", { name: "Save name" }).click();

  await expect.element(page.getByText("Name saved.")).toBeInTheDocument();
  await expect.element(page.getByText("Signed in as Ada King")).toBeInTheDocument();
});

test("stores the name", async () => {
  await signedIn();
  await renderServer({ url: "/profile" });

  await page.getByLabelText("Name").fill("Ada King");
  await page.getByRole("button", { name: "Save name" }).click();

  await expect.element(page.getByText("Name saved.")).toBeInTheDocument();
  expect((await storedUser("ada@example.com"))?.name).toBe("Ada King");
});

test("requires a name", async () => {
  await signedIn();
  await renderServer({ url: "/profile" });

  await page.getByLabelText("Name").fill("");
  await page.getByRole("button", { name: "Save name" }).click();

  await expect.element(page.getByText("Name is required.")).toBeInTheDocument();
  expect((await storedUser("ada@example.com"))?.name).toBe("Ada Lovelace");
});

test("trims the name", async () => {
  await signedIn();
  await renderServer({ url: "/profile" });

  await page.getByLabelText("Name").fill("  Ada King  ");
  await page.getByRole("button", { name: "Save name" }).click();

  await expect.element(page.getByText("Signed in as Ada King")).toBeInTheDocument();
  expect((await storedUser("ada@example.com"))?.name).toBe("Ada King");
});

test("opens from the header of the notes", async () => {
  await signedIn();
  await renderServer({ url: "/notes" });

  await page.getByRole("link", { name: "Profile" }).click();

  await expect.element(page.getByText("Email: ada@example.com")).toBeInTheDocument();
});

test("shows the user that is signed in, not another", async () => {
  await createUser(grace);
  await signedIn();
  await renderServer({ url: "/profile" });

  await expect.element(page.getByText("Email: ada@example.com")).toBeInTheDocument();
  await expect.element(page.getByText("Email: grace@example.com")).not.toBeInTheDocument();
});
