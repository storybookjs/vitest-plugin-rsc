import { test } from "vitest";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { click, expect, screen } from "#test/fast-dom.ts";
import { sessionCount } from "#test/db.ts";
import { signedIn } from "#test/vitest.ts";

test("signs out", async () => {
  await signedIn();
  await renderServer({ url: "/notes" });

  await click(screen.getByRole("button", { name: "Sign out" }));

  await expect.element(screen.getByText("You are signed out.")).toBeInTheDocument();
});

test("ends the session", async () => {
  await signedIn();
  await renderServer({ url: "/notes" });

  await click(screen.getByRole("button", { name: "Sign out" }));

  await expect.element(screen.getByText("You are signed out.")).toBeInTheDocument();
  expect(await sessionCount()).toBe(0);
});

test("shows the links to sign in after signing out", async () => {
  await signedIn();
  await renderServer({ url: "/profile" });

  await click(screen.getByRole("button", { name: "Sign out" }));

  await expect
    .element(screen.getByRole("navigation").getByRole("link", { name: "Sign in" }))
    .toBeInTheDocument();
  await expect.element(screen.getByText("Signed in as Ada Lovelace")).not.toBeInTheDocument();
});

for (const url of ["/notes", "/notes/new", "/profile", "/notes/1", "/notes/1/edit"]) {
  test(`sends a visitor of ${url} to sign in`, async () => {
    await renderServer({ url });

    await expect.element(screen.getByRole("heading", { name: "Sign in" })).toBeInTheDocument();
  });
}

test("shows the home page to a visitor", async () => {
  await renderServer({ url: "/" });

  await expect.element(screen.getByRole("heading", { name: "Notes" })).toBeInTheDocument();
  await expect.element(screen.getByRole("link", { name: "Create an account" })).toBeInTheDocument();
});

test("sends a signed-in user from the home page to the notes", async () => {
  await signedIn();
  await renderServer({ url: "/" });

  await expect.element(screen.getByText("0 notes")).toBeInTheDocument();
  await expect.element(screen.getByText("Signed in as Ada Lovelace")).toBeInTheDocument();
});
