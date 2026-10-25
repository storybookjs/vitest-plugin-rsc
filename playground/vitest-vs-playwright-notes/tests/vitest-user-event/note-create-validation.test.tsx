import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { click, fill } from "#test/user-event.ts";
import { storedNotes } from "#test/db.ts";
import { signedIn } from "#test/vitest.ts";

test("requires a title", async () => {
  await signedIn();
  await renderServer({ url: "/notes/new" });

  await click(page.getByRole("button", { name: "Create note" }));

  await expect.element(page.getByText("Title is required.")).toBeInTheDocument();
});

test("requires a title that is not only spaces", async () => {
  await signedIn();
  await renderServer({ url: "/notes/new" });

  await fill(page.getByLabelText("Title"), "     ");
  await click(page.getByRole("button", { name: "Create note" }));

  await expect.element(page.getByText("Title is required.")).toBeInTheDocument();
});

test("rejects a title of more than 100 characters", async () => {
  await signedIn();
  await renderServer({ url: "/notes/new" });

  await fill(page.getByLabelText("Title"), "x".repeat(101));
  await click(page.getByRole("button", { name: "Create note" }));

  await expect.element(page.getByText("Title is at most 100 characters.")).toBeInTheDocument();
});

test("accepts a title of 100 characters", async () => {
  await signedIn();
  await renderServer({ url: "/notes/new" });

  await fill(page.getByLabelText("Title"), "x".repeat(100));
  await click(page.getByRole("button", { name: "Create note" }));

  await expect.element(page.getByText("Note created.")).toBeInTheDocument();
});

test("rejects content of more than 2000 characters", async () => {
  await signedIn();
  await renderServer({ url: "/notes/new" });

  await fill(page.getByLabelText("Title"), "Long");
  await fill(page.getByLabelText("Content"), "x".repeat(2001));
  await click(page.getByRole("button", { name: "Create note" }));

  await expect.element(page.getByText("Content is at most 2000 characters.")).toBeInTheDocument();
});

test("keeps the title and the content after an error", async () => {
  await signedIn();
  await renderServer({ url: "/notes/new" });

  await fill(page.getByLabelText("Title"), "x".repeat(101));
  await fill(page.getByLabelText("Content"), "Keep this");
  await click(page.getByRole("button", { name: "Create note" }));

  await expect.element(page.getByText("Title is at most 100 characters.")).toBeInTheDocument();
  await expect.element(page.getByLabelText("Title")).toHaveValue("x".repeat(101));
  await expect.element(page.getByLabelText("Content")).toHaveValue("Keep this");
});

test("marks the title invalid", async () => {
  await signedIn();
  await renderServer({ url: "/notes/new" });

  await click(page.getByRole("button", { name: "Create note" }));

  await expect.element(page.getByLabelText("Title")).toHaveAttribute("aria-invalid", "true");
});

test("stores nothing after an error", async () => {
  const user = await signedIn();
  await renderServer({ url: "/notes/new" });

  await fill(page.getByLabelText("Content"), "No title");
  await click(page.getByRole("button", { name: "Create note" }));

  await expect.element(page.getByText("Title is required.")).toBeInTheDocument();
  expect(await storedNotes(user.id)).toEqual([]);
});

test("creates the note once the error is fixed", async () => {
  await signedIn();
  await renderServer({ url: "/notes/new" });

  await click(page.getByRole("button", { name: "Create note" }));
  await expect.element(page.getByText("Title is required.")).toBeInTheDocument();
  await fill(page.getByLabelText("Title"), "Groceries");
  await click(page.getByRole("button", { name: "Create note" }));

  await expect.element(page.getByText("Note created.")).toBeInTheDocument();
});

test("shows every error at once", async () => {
  await signedIn();
  await renderServer({ url: "/notes/new" });

  await fill(page.getByLabelText("Content"), "x".repeat(2001));
  await click(page.getByRole("button", { name: "Create note" }));

  await expect.element(page.getByText("Title is required.")).toBeInTheDocument();
  await expect.element(page.getByText("Content is at most 2000 characters.")).toBeInTheDocument();
});
