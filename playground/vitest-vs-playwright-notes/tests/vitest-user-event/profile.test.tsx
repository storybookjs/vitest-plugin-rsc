import { test } from "vitest";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { click, expect, fill, screen } from "#test/fast-dom.ts";
import { createUser, grace, seedNotes, storedUser } from "#test/db.ts";
import { signedIn } from "#test/vitest.ts";

test("shows the email of the user", async () => {
  await signedIn();
  await renderServer({ url: "/profile" });

  await expect.element(screen.getByRole("heading", { name: "Profile" })).toBeInTheDocument();
  await expect.element(screen.getByText("Email: ada@example.com")).toBeInTheDocument();
});

test("counts no notes", async () => {
  await signedIn();
  await renderServer({ url: "/profile" });

  await expect.element(screen.getByText("You have 0 notes.")).toBeInTheDocument();
});

test("counts one note", async () => {
  const user = await signedIn();
  await seedNotes(user.id, [{ title: "Groceries" }]);
  await renderServer({ url: "/profile" });

  await expect.element(screen.getByText("You have 1 note.")).toBeInTheDocument();
});

test("fills in the name", async () => {
  await signedIn();
  await renderServer({ url: "/profile" });

  await expect.element(screen.getByLabelText("Name")).toHaveValue("Ada Lovelace");
});

test("saves the name", async () => {
  await signedIn();
  await renderServer({ url: "/profile" });

  await fill(screen.getByLabelText("Name"), "Ada King");
  await click(screen.getByRole("button", { name: "Save name" }));

  await expect.element(screen.getByText("Name saved.")).toBeInTheDocument();
  await expect.element(screen.getByText("Signed in as Ada King")).toBeInTheDocument();
});

test("stores the name", async () => {
  await signedIn();
  await renderServer({ url: "/profile" });

  await fill(screen.getByLabelText("Name"), "Ada King");
  await click(screen.getByRole("button", { name: "Save name" }));

  await expect.element(screen.getByText("Name saved.")).toBeInTheDocument();
  expect((await storedUser("ada@example.com"))?.name).toBe("Ada King");
});

test("requires a name", async () => {
  await signedIn();
  await renderServer({ url: "/profile" });

  await fill(screen.getByLabelText("Name"), "");
  await click(screen.getByRole("button", { name: "Save name" }));

  await expect.element(screen.getByText("Name is required.")).toBeInTheDocument();
  expect((await storedUser("ada@example.com"))?.name).toBe("Ada Lovelace");
});

test("trims the name", async () => {
  await signedIn();
  await renderServer({ url: "/profile" });

  await fill(screen.getByLabelText("Name"), "  Ada King  ");
  await click(screen.getByRole("button", { name: "Save name" }));

  await expect.element(screen.getByText("Signed in as Ada King")).toBeInTheDocument();
  expect((await storedUser("ada@example.com"))?.name).toBe("Ada King");
});

test("opens from the header of the notes", async () => {
  await signedIn();
  await renderServer({ url: "/notes" });

  await click(screen.getByRole("link", { name: "Profile" }));

  await expect.element(screen.getByText("Email: ada@example.com")).toBeInTheDocument();
});

test("shows the user that is signed in, not another", async () => {
  await createUser(grace);
  await signedIn();
  await renderServer({ url: "/profile" });

  await expect.element(screen.getByText("Email: ada@example.com")).toBeInTheDocument();
  await expect.element(screen.getByText("Email: grace@example.com")).not.toBeInTheDocument();
});
