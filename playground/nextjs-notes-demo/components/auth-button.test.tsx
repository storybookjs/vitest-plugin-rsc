import { expect, test, vi } from "vitest";
import { renderServer, NextRouter } from "vitest-plugin-rsc/nextjs/testing-library";

import { screen } from "@testing-library/dom";
import AuthButton from "./auth-button";
import { getUser } from "../libs/session";

test("renders login button when logged out", async () => {
  await renderServer(
    <NextRouter>
      <AuthButton noteId={null}>Add</AuthButton>
    </NextRouter>,
  );

  expect(await screen.findByRole("menuitem", { name: "Login to Add" })).toBeVisible();
});

test("renders login button when logged out", async () => {
  await renderServer(
    <NextRouter>
      <AuthButton noteId={null}>Add</AuthButton>
    </NextRouter>,
  );
});

test("renders add button when logged in", async () => {
  vi.mocked(getUser).mockReturnValue("storybookjs");

  await renderServer(
    <NextRouter>
      <AuthButton noteId={null}>Add</AuthButton>
    </NextRouter>,
  );

  expect(await screen.findByRole("menuitem", { name: /Add/ })).toBeVisible();
});

test("renders outlined edit button for a specific note", async () => {
  vi.mocked(getUser).mockReturnValue("storybookjs");

  await renderServer(
    <NextRouter>
      <AuthButton noteId="1">Edit</AuthButton>
    </NextRouter>,
  );

  const menuItem = await screen.findByRole("menuitem", { name: /Edit/ });
  expect(menuItem).toBeVisible();
  expect(menuItem).toHaveClass("edit-button--outline");
});
