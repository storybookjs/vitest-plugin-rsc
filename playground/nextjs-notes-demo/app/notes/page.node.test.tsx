import { expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { within } from "@testing-library/dom";
import userEvent from "@testing-library/user-event";
import { db } from "#lib/db.ts";
import { notes } from "#db/schema.ts";
import { signedInAs, testUser } from "#test/auth.ts";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";

// Tests of page.test.tsx in a Node.js worker with happy-dom: see the node
// project of vitest.config.ts.

// Testing Library's `screen` is of the `<body>` there was as it loaded, and a
// page has a `<body>` of its own, as after a page load: the queries are of
// the one there is.
const screen = () => within(document.body);

test("renders Notes heading", async () => {
  await signedInAs();
  await renderServer({ url: "/notes" });
  expect(await screen().findByRole("heading", { name: "Notes" })).toBeTruthy();
});

test("favorite toggle updates stored favorite state", async () => {
  await signedInAs();
  const [inserted] = await db
    .insert(notes)
    .values({ ownerId: testUser.id, title: "Toggle me", isFavorite: false })
    .returning({ id: notes.id });
  if (!inserted) throw new Error("Failed to insert note");

  await renderServer({ url: "/notes" });

  await userEvent.click(await screen().findByRole("button", { name: "Favorite note" }));

  await expect
    .poll(async () => {
      const [row] = await db.select().from(notes).where(eq(notes.id, inserted.id));
      return row?.isFavorite;
    })
    .toBe(true);
  expect(await screen().findByRole("button", { name: "Unfavorite note" })).toBeTruthy();
});
