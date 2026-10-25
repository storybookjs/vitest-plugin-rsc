import { expect } from "vitest";
import { page } from "vitest/browser";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { click, fill } from "#test/user-event.ts";
import { createUser, seedNotes, storedUser } from "#test/db.ts";
import { signedIn, test } from "#test/vitest.ts";

test("shows the email of the user", async () => {
  const user = await signedIn();
  await renderServer({ url: "/profile" });

  await expect.element(page.getByRole("heading", { name: "Profile" })).toBeInTheDocument();
  await expect.element(page.getByText(`Email: ${user.email}`)).toBeInTheDocument();
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

  await fill(page.getByLabelText("Name"), "Ada King");
  await click(page.getByRole("button", { name: "Save name" }));

  await expect.element(page.getByText("Name saved.")).toBeInTheDocument();
  await expect.element(page.getByText("Signed in as Ada King")).toBeInTheDocument();
});

test("stores the name", async () => {
  const user = await signedIn();
  await renderServer({ url: "/profile" });

  await fill(page.getByLabelText("Name"), "Ada King");
  await click(page.getByRole("button", { name: "Save name" }));

  await expect.element(page.getByText("Name saved.")).toBeInTheDocument();
  expect((await storedUser(user.email))?.name).toBe("Ada King");
});

test("requires a name", async () => {
  const user = await signedIn();
  await renderServer({ url: "/profile" });

  await fill(page.getByLabelText("Name"), "");
  await click(page.getByRole("button", { name: "Save name" }));

  await expect.element(page.getByText("Name is required.")).toBeInTheDocument();
  expect((await storedUser(user.email))?.name).toBe("Ada Lovelace");
});

test("trims the name", async () => {
  const user = await signedIn();
  await renderServer({ url: "/profile" });

  await fill(page.getByLabelText("Name"), "  Ada King  ");
  await click(page.getByRole("button", { name: "Save name" }));

  await expect.element(page.getByText("Signed in as Ada King")).toBeInTheDocument();
  expect((await storedUser(user.email))?.name).toBe("Ada King");
});

test("opens from the header of the notes", async () => {
  const user = await signedIn();
  await renderServer({ url: "/notes" });

  await click(page.getByRole("link", { name: "Profile" }));

  await expect.element(page.getByText(`Email: ${user.email}`)).toBeInTheDocument();
});

test("shows the user that is signed in, not another", async ({ people }) => {
  await createUser(people.grace);
  const user = await signedIn();
  await renderServer({ url: "/profile" });

  await expect.element(page.getByText(`Email: ${user.email}`)).toBeInTheDocument();
  await expect.element(page.getByText(`Email: ${people.grace.email}`)).not.toBeInTheDocument();
});
