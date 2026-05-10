import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { signInAs } from "#test/auth.ts";
import { renderServer } from "#test/render.tsx";
import NewNotePage from "./page.tsx";

test("renders the new note form with empty fields", async () => {
  await signInAs();
  await renderServer(<NewNotePage />, { url: "/notes/new" });

  await expect
    .element(page.getByRole("heading", { level: 1, name: "New note" }))
    .toBeInTheDocument();
  await expect.element(page.getByLabelText("Title")).toHaveValue("");
  await expect.element(page.getByLabelText("Content")).toHaveValue("");
  await expect.element(page.getByPlaceholder("A short, scannable title")).toBeInTheDocument();
  await expect.element(page.getByPlaceholder("Write something...")).toBeInTheDocument();
  await expect.element(page.getByRole("link", { name: "All notes" })).toBeInTheDocument();
  await expect.element(page.getByRole("link", { name: "Cancel" })).toBeInTheDocument();
  await expect.element(page.getByRole("button", { name: "Create note" })).toBeInTheDocument();
});

test("renders server validation errors and keeps old input", async () => {
  await signInAs();
  await renderServer(<NewNotePage />, { url: "/notes/new" });

  await page.getByLabelText("Content").fill("Keep this body");
  await page.getByRole("button", { name: "Create note" }).click();

  await expect.element(page.getByText("Title is required.")).toBeInTheDocument();
  await expect.element(page.getByLabelText("Title")).toHaveAttribute("aria-invalid", "true");
  await expect.element(page.getByLabelText("Content")).toHaveValue("Keep this body");
});
