import { test } from "vitest";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { click, expect, fill, screen } from "#test/fast-dom.ts";
import { storedNotes } from "#test/db.ts";
import { signedIn } from "#test/vitest.ts";

test("requires a title", async () => {
  await signedIn();
  await renderServer({ url: "/notes/new" });

  await click(screen.getByRole("button", { name: "Create note" }));

  await expect.element(screen.getByText("Title is required.")).toBeInTheDocument();
});

test("requires a title that is not only spaces", async () => {
  await signedIn();
  await renderServer({ url: "/notes/new" });

  await fill(screen.getByLabelText("Title"), "     ");
  await click(screen.getByRole("button", { name: "Create note" }));

  await expect.element(screen.getByText("Title is required.")).toBeInTheDocument();
});

test("rejects a title of more than 100 characters", async () => {
  await signedIn();
  await renderServer({ url: "/notes/new" });

  await fill(screen.getByLabelText("Title"), "x".repeat(101));
  await click(screen.getByRole("button", { name: "Create note" }));

  await expect.element(screen.getByText("Title is at most 100 characters.")).toBeInTheDocument();
});

test("accepts a title of 100 characters", async () => {
  await signedIn();
  await renderServer({ url: "/notes/new" });

  await fill(screen.getByLabelText("Title"), "x".repeat(100));
  await click(screen.getByRole("button", { name: "Create note" }));

  await expect.element(screen.getByText("Note created.")).toBeInTheDocument();
});

test("rejects content of more than 2000 characters", async () => {
  await signedIn();
  await renderServer({ url: "/notes/new" });

  await fill(screen.getByLabelText("Title"), "Long");
  await fill(screen.getByLabelText("Content"), "x".repeat(2001));
  await click(screen.getByRole("button", { name: "Create note" }));

  await expect.element(screen.getByText("Content is at most 2000 characters.")).toBeInTheDocument();
});

test("keeps the title and the content after an error", async () => {
  await signedIn();
  await renderServer({ url: "/notes/new" });

  await fill(screen.getByLabelText("Title"), "x".repeat(101));
  await fill(screen.getByLabelText("Content"), "Keep this");
  await click(screen.getByRole("button", { name: "Create note" }));

  await expect.element(screen.getByText("Title is at most 100 characters.")).toBeInTheDocument();
  await expect.element(screen.getByLabelText("Title")).toHaveValue("x".repeat(101));
  await expect.element(screen.getByLabelText("Content")).toHaveValue("Keep this");
});

test("marks the title invalid", async () => {
  await signedIn();
  await renderServer({ url: "/notes/new" });

  await click(screen.getByRole("button", { name: "Create note" }));

  await expect.element(screen.getByLabelText("Title")).toHaveAttribute("aria-invalid", "true");
});

test("stores nothing after an error", async () => {
  await signedIn();
  await renderServer({ url: "/notes/new" });

  await fill(screen.getByLabelText("Content"), "No title");
  await click(screen.getByRole("button", { name: "Create note" }));

  await expect.element(screen.getByText("Title is required.")).toBeInTheDocument();
  expect(await storedNotes()).toEqual([]);
});

test("creates the note once the error is fixed", async () => {
  await signedIn();
  await renderServer({ url: "/notes/new" });

  await click(screen.getByRole("button", { name: "Create note" }));
  await expect.element(screen.getByText("Title is required.")).toBeInTheDocument();
  await fill(screen.getByLabelText("Title"), "Groceries");
  await click(screen.getByRole("button", { name: "Create note" }));

  await expect.element(screen.getByText("Note created.")).toBeInTheDocument();
});

test("shows every error at once", async () => {
  await signedIn();
  await renderServer({ url: "/notes/new" });

  await fill(screen.getByLabelText("Content"), "x".repeat(2001));
  await click(screen.getByRole("button", { name: "Create note" }));

  await expect.element(screen.getByText("Title is required.")).toBeInTheDocument();
  await expect.element(screen.getByText("Content is at most 2000 characters.")).toBeInTheDocument();
});
