import { test } from "vitest";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { click, expect, fill, screen } from "#test/fast-dom.ts";
import { ada, createUser, seedNotes } from "#test/db.ts";
import { signedIn } from "#test/vitest.ts";
import { expectTitles } from "#test/fast-dom-notes.ts";

test("goes from the home page to sign up", async () => {
  await renderServer({ url: "/" });

  await click(screen.getByRole("link", { name: "Create an account" }));

  await expect
    .element(screen.getByRole("heading", { name: "Create an account" }))
    .toBeInTheDocument();
});

test("goes from the home page to sign in", async () => {
  await renderServer({ url: "/" });

  await click(screen.getByRole("link", { name: "Sign in" }));

  await expect.element(screen.getByRole("heading", { name: "Sign in" })).toBeInTheDocument();
});

test("goes from the profile back to the notes", async () => {
  await signedIn();
  await renderServer({ url: "/profile" });

  await click(screen.getByRole("link", { name: "Notes" }));

  await expect.element(screen.getByText("No notes yet")).toBeInTheDocument();
});

test("signs up and writes a first note", async () => {
  await renderServer({ url: "/sign-up" });

  await fill(screen.getByLabelText("Name"), ada.name);
  await fill(screen.getByLabelText("Email"), ada.email);
  await fill(screen.getByLabelText("Password"), ada.password);
  await click(screen.getByRole("button", { name: "Create account" }));
  await click(screen.getByRole("link", { name: "New note" }));
  await fill(screen.getByLabelText("Title"), "First note");
  await click(screen.getByRole("button", { name: "Create note" }));
  await expect.element(screen.getByText("Note created.")).toBeInTheDocument();
  await click(screen.getByRole("link", { name: "All notes" }));

  await expectTitles(["First note"]);
});

test("signs in, searches and opens a note", async () => {
  const user = await createUser(ada);
  await seedNotes(user.id, [{ title: "Groceries", content: "Oat milk" }, { title: "Ideas" }]);
  await renderServer({ url: "/sign-in" });

  await fill(screen.getByLabelText("Email"), ada.email);
  await fill(screen.getByLabelText("Password"), ada.password);
  await click(screen.getByRole("main").getByRole("button", { name: "Sign in" }));
  await fill(screen.getByLabelText("Search"), "oat");
  await click(screen.getByRole("button", { name: "Search" }));
  // The results, before a click: the list before the search has the link too.
  await expectTitles(["Groceries"]);
  await click(screen.getByRole("link", { name: "Groceries" }));

  await expect.element(screen.getByText("Oat milk")).toBeInTheDocument();
});

test("writes, edits and lists a note", async () => {
  await signedIn();
  await renderServer({ url: "/notes/new" });

  await fill(screen.getByLabelText("Title"), "Draft");
  await click(screen.getByRole("button", { name: "Create note" }));
  await click(screen.getByRole("link", { name: "Edit" }));
  await fill(screen.getByLabelText("Title"), "Final");
  await click(screen.getByRole("button", { name: "Save note" }));
  await expect.element(screen.getByText("Note saved.")).toBeInTheDocument();
  await click(screen.getByRole("link", { name: "All notes" }));

  await expectTitles(["Final"]);
});

test("writes and favorites a note", async () => {
  const user = await signedIn();
  await seedNotes(user.id, [{ title: "Older" }]);
  await renderServer({ url: "/notes/new" });

  await fill(screen.getByLabelText("Title"), "Newer");
  await click(screen.getByRole("button", { name: "Create note" }));
  await click(screen.getByRole("button", { name: "Favorite" }));
  await expect.element(screen.getByRole("button", { name: "Unfavorite" })).toBeInTheDocument();
  await click(screen.getByRole("link", { name: "All notes" }));

  await expect.element(screen.getByText("★ Favorite")).toBeInTheDocument();
  await expectTitles(["Newer", "Older"]);
});

test("writes and deletes a note", async () => {
  await signedIn();
  await renderServer({ url: "/notes/new" });

  await fill(screen.getByLabelText("Title"), "Temporary");
  await click(screen.getByRole("button", { name: "Create note" }));
  await click(screen.getByRole("button", { name: "Delete" }));

  await expect.element(screen.getByText("Note deleted.")).toBeInTheDocument();
  await expect.element(screen.getByText("No notes yet")).toBeInTheDocument();
});

test("signs out and back in", async () => {
  await signedIn();
  await renderServer({ url: "/notes" });

  await click(screen.getByRole("button", { name: "Sign out" }));
  await fill(screen.getByLabelText("Email"), ada.email);
  await fill(screen.getByLabelText("Password"), ada.password);
  await click(screen.getByRole("main").getByRole("button", { name: "Sign in" }));

  await expect.element(screen.getByText("Signed in as Ada Lovelace")).toBeInTheDocument();
});

test("renames oneself and sees the name in the header", async () => {
  await signedIn();
  await renderServer({ url: "/notes" });

  await click(screen.getByRole("link", { name: "Profile" }));
  await fill(screen.getByLabelText("Name"), "Countess Lovelace");
  await click(screen.getByRole("button", { name: "Save name" }));
  await expect.element(screen.getByText("Name saved.")).toBeInTheDocument();
  await click(screen.getByRole("link", { name: "Notes" }));

  await expect.element(screen.getByText("Signed in as Countess Lovelace")).toBeInTheDocument();
});
