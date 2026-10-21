import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { signedInAs } from "#test/auth.ts";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";

test("renders the new note form with empty fields", async () => {
  await signedInAs();
  await renderServer({ url: "/notes/new" });

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

test("creates a note dated by the app's clock", async () => {
  await signedInAs();
  await renderServer({ url: "/notes/new" });

  await page.getByLabelText("Title").fill("Groceries");
  await page.getByRole("button", { name: "Create note" }).click();

  await expect
    .element(page.getByRole("heading", { level: 1, name: "Groceries" }))
    .toBeInTheDocument();
  // lib/__mocks__/clock.ts, not the tab's Date, which vitest.setup.ts fixes
  // at another day.
  await expect.element(page.getByText("Updated Jan 15, 2026")).toBeInTheDocument();
});

test("renders server validation errors and keeps old input", async () => {
  await signedInAs();
  await renderServer({ url: "/notes/new" });

  await page.getByLabelText("Content").fill("Keep this body");
  await page.getByRole("button", { name: "Create note" }).click();

  await expect.element(page.getByText("Title is required.")).toBeInTheDocument();
  await expect.element(page.getByLabelText("Title")).toHaveAttribute("aria-invalid", "true");
  await expect.element(page.getByLabelText("Content")).toHaveValue("Keep this body");
});

test("shows the flashed errors once, not on a later visit", async () => {
  await signedInAs();
  await renderServer({ url: "/notes/new" });

  await page.getByLabelText("Content").fill("Keep this body");
  await page.getByRole("button", { name: "Create note" }).click();
  await expect.element(page.getByText("Title is required.")).toBeInTheDocument();

  await page.getByRole("link", { name: "All notes" }).click();
  await expect.element(page.getByRole("heading", { level: 1, name: "Notes" })).toBeInTheDocument();
  await page.getByRole("link", { name: "New note" }).first().click();

  await expect
    .element(page.getByRole("heading", { level: 1, name: "New note" }))
    .toBeInTheDocument();
  await expect.element(page.getByText("Title is required.")).not.toBeInTheDocument();
  await expect.element(page.getByLabelText("Content")).toHaveValue("");
});
