import { test } from "vitest";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { click, expect, fill, screen } from "#test/fast-dom.ts";
import { createUser, grace, seedNotes, storedNotes } from "#test/db.ts";
import { signedIn } from "#test/vitest.ts";

test("requires a title", async () => {
  const user = await signedIn();
  await seedNotes(user.id, [{ title: "Groceries" }]);
  await renderServer({ url: "/notes/1/edit" });

  await fill(screen.getByLabelText("Title"), "");
  await click(screen.getByRole("button", { name: "Save note" }));

  await expect.element(screen.getByText("Title is required.")).toBeInTheDocument();
});

test("rejects a title of more than 100 characters", async () => {
  const user = await signedIn();
  await seedNotes(user.id, [{ title: "Groceries" }]);
  await renderServer({ url: "/notes/1/edit" });

  await fill(screen.getByLabelText("Title"), "x".repeat(101));
  await click(screen.getByRole("button", { name: "Save note" }));

  await expect.element(screen.getByText("Title is at most 100 characters.")).toBeInTheDocument();
});

test("rejects content of more than 2000 characters", async () => {
  const user = await signedIn();
  await seedNotes(user.id, [{ title: "Groceries" }]);
  await renderServer({ url: "/notes/1/edit" });

  await fill(screen.getByLabelText("Content"), "x".repeat(2001));
  await click(screen.getByRole("button", { name: "Save note" }));

  await expect.element(screen.getByText("Content is at most 2000 characters.")).toBeInTheDocument();
});

test("keeps the edits after an error", async () => {
  const user = await signedIn();
  await seedNotes(user.id, [{ title: "Groceries", content: "Oat milk" }]);
  await renderServer({ url: "/notes/1/edit" });

  await fill(screen.getByLabelText("Title"), "");
  await fill(screen.getByLabelText("Content"), "Changed");
  await click(screen.getByRole("button", { name: "Save note" }));

  await expect.element(screen.getByText("Title is required.")).toBeInTheDocument();
  await expect.element(screen.getByLabelText("Content")).toHaveValue("Changed");
});

test("stores nothing after an error", async () => {
  const user = await signedIn();
  await seedNotes(user.id, [{ title: "Groceries", content: "Oat milk" }]);
  await renderServer({ url: "/notes/1/edit" });

  await fill(screen.getByLabelText("Title"), "");
  await fill(screen.getByLabelText("Content"), "Changed");
  await click(screen.getByRole("button", { name: "Save note" }));

  await expect.element(screen.getByText("Title is required.")).toBeInTheDocument();
  expect(await storedNotes()).toEqual([
    { title: "Groceries", content: "Oat milk", favorite: false },
  ]);
});

test("marks the title invalid", async () => {
  const user = await signedIn();
  await seedNotes(user.id, [{ title: "Groceries" }]);
  await renderServer({ url: "/notes/1/edit" });

  await fill(screen.getByLabelText("Title"), "");
  await click(screen.getByRole("button", { name: "Save note" }));

  await expect.element(screen.getByLabelText("Title")).toHaveAttribute("aria-invalid", "true");
});

test("saves once the error is fixed", async () => {
  const user = await signedIn();
  await seedNotes(user.id, [{ title: "Groceries" }]);
  await renderServer({ url: "/notes/1/edit" });

  await fill(screen.getByLabelText("Title"), "");
  await click(screen.getByRole("button", { name: "Save note" }));
  await expect.element(screen.getByText("Title is required.")).toBeInTheDocument();
  await fill(screen.getByLabelText("Title"), "Shopping");
  await click(screen.getByRole("button", { name: "Save note" }));

  await expect.element(screen.getByText("Note saved.")).toBeInTheDocument();
});

test("shows a 404 for the note of another user", async () => {
  await signedIn();
  const other = await createUser(grace);
  await seedNotes(other.id, [{ title: "Grace's" }]);
  await renderServer({ url: "/notes/1/edit" });

  await expect.element(screen.getByText("This page could not be found.")).toBeInTheDocument();
});

test("shows a 404 for a note that does not exist", async () => {
  await signedIn();
  await renderServer({ url: "/notes/42/edit" });

  await expect.element(screen.getByText("This page could not be found.")).toBeInTheDocument();
});

test("counts the characters as one types", async () => {
  const user = await signedIn();
  await seedNotes(user.id, [{ title: "Groceries", content: "Oat milk" }]);
  await renderServer({ url: "/notes/1/edit" });

  await fill(screen.getByLabelText("Content"), "abc");

  await expect.element(screen.getByText("3 / 2000")).toBeInTheDocument();
});
