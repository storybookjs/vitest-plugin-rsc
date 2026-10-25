import { expect } from "vitest";
import { page } from "vitest/browser";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { click, fill } from "#test/user-event.ts";
import { createUser, seedNotes } from "#test/db.ts";
import { ada } from "#test/people.ts";
import { expectTitles, signedIn, test } from "#test/vitest.ts";

test("goes from the home page to sign up", async () => {
  await renderServer({ url: "/" });

  await click(page.getByRole("link", { name: "Create an account" }));

  await expect
    .element(page.getByRole("heading", { name: "Create an account" }))
    .toBeInTheDocument();
});

test("goes from the home page to sign in", async () => {
  await renderServer({ url: "/" });

  await click(page.getByRole("link", { name: "Sign in" }));

  await expect.element(page.getByRole("heading", { name: "Sign in" })).toBeInTheDocument();
});

test("goes from the profile back to the notes", async () => {
  await signedIn();
  await renderServer({ url: "/profile" });

  await click(page.getByRole("link", { name: "Notes", exact: true }));

  await expect.element(page.getByText("No notes yet")).toBeInTheDocument();
});

test("signs up and writes a first note", async ({ people }) => {
  await renderServer({ url: "/sign-up" });

  await fill(page.getByLabelText("Name"), people.ada.name);
  await fill(page.getByLabelText("Email"), people.ada.email);
  await fill(page.getByLabelText("Password"), people.ada.password);
  await click(page.getByRole("button", { name: "Create account" }));
  await click(page.getByRole("link", { name: "New note" }));
  await fill(page.getByLabelText("Title"), "First note");
  await click(page.getByRole("button", { name: "Create note" }));
  await expect.element(page.getByText("Note created.")).toBeInTheDocument();
  await click(page.getByRole("link", { name: "All notes" }));

  await expectTitles(["First note"]);
});

test("signs in, searches and opens a note", async ({ people }) => {
  const user = await createUser(people.ada);
  await seedNotes(user.id, [{ title: "Groceries", content: "Oat milk" }, { title: "Ideas" }]);
  await renderServer({ url: "/sign-in" });

  await fill(page.getByLabelText("Email"), people.ada.email);
  await fill(page.getByLabelText("Password"), people.ada.password);
  await click(page.getByRole("main").getByRole("button", { name: "Sign in" }));
  await fill(page.getByLabelText("Search"), "oat");
  await click(page.getByRole("button", { name: "Search" }));
  // The results, before a click: the list before the search has the link too.
  await expectTitles(["Groceries"]);
  await click(page.getByRole("link", { name: "Groceries" }));

  await expect.element(page.getByText("Oat milk")).toBeInTheDocument();
});

test("writes, edits and lists a note", async () => {
  await signedIn();
  await renderServer({ url: "/notes/new" });

  await fill(page.getByLabelText("Title"), "Draft");
  await click(page.getByRole("button", { name: "Create note" }));
  await click(page.getByRole("link", { name: "Edit" }));
  await fill(page.getByLabelText("Title"), "Final");
  await click(page.getByRole("button", { name: "Save note" }));
  await expect.element(page.getByText("Note saved.")).toBeInTheDocument();
  await click(page.getByRole("link", { name: "All notes" }));

  await expectTitles(["Final"]);
});

test("writes and favorites a note", async () => {
  const user = await signedIn();
  await seedNotes(user.id, [{ title: "Older" }]);
  await renderServer({ url: "/notes/new" });

  await fill(page.getByLabelText("Title"), "Newer");
  await click(page.getByRole("button", { name: "Create note" }));
  await click(page.getByRole("button", { name: "Favorite", exact: true }));
  await expect.element(page.getByRole("button", { name: "Unfavorite" })).toBeInTheDocument();
  await click(page.getByRole("link", { name: "All notes" }));

  await expect.element(page.getByText("★ Favorite")).toBeInTheDocument();
  await expectTitles(["Newer", "Older"]);
});

test("writes and deletes a note", async () => {
  await signedIn();
  await renderServer({ url: "/notes/new" });

  await fill(page.getByLabelText("Title"), "Temporary");
  await click(page.getByRole("button", { name: "Create note" }));
  await click(page.getByRole("button", { name: "Delete" }));

  await expect.element(page.getByText("Note deleted.")).toBeInTheDocument();
  await expect.element(page.getByText("No notes yet")).toBeInTheDocument();
});

test("signs out and back in", async () => {
  const user = await signedIn();
  await renderServer({ url: "/notes" });

  await click(page.getByRole("button", { name: "Sign out" }));
  await fill(page.getByLabelText("Email"), user.email);
  await fill(page.getByLabelText("Password"), ada.password);
  await click(page.getByRole("main").getByRole("button", { name: "Sign in" }));

  await expect.element(page.getByText("Signed in as Ada Lovelace")).toBeInTheDocument();
});

test("renames oneself and sees the name in the header", async () => {
  await signedIn();
  await renderServer({ url: "/notes" });

  await click(page.getByRole("link", { name: "Profile" }));
  await fill(page.getByLabelText("Name"), "Countess Lovelace");
  await click(page.getByRole("button", { name: "Save name" }));
  await expect.element(page.getByText("Name saved.")).toBeInTheDocument();
  await click(page.getByRole("link", { name: "Notes", exact: true }));

  await expect.element(page.getByText("Signed in as Countess Lovelace")).toBeInTheDocument();
});
