import { within } from "@testing-library/dom";
import userEvent from "@testing-library/user-event";
import pg from "pg";
import { expect, test } from "vitest";
import { signedInAs } from "#test/auth.ts";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";

// The app's own `lib/db.ts`, node-postgres, over TCP to the Postgres of
// vitest.setup.tcp.ts: see the TCP project of vitest.config.ts.

// Testing Library's `screen` is of the `<body>` there was as it loaded, and a
// page has a `<body>` of its own: the queries are of the one there is.
const screen = () => within(document.body);

test("a Server Action creates a note in Postgres, over TCP", async () => {
  await signedInAs();
  await renderServer({ url: "/notes/new" });

  await userEvent.type(await screen().findByLabelText("Title"), "Over TCP");
  await userEvent.click(await screen().findByRole("button", { name: "Create note" }));

  expect(await screen().findByRole("heading", { level: 1, name: "Over TCP" })).toBeTruthy();
  // And there it is, read over a connection of the test's own.
  // oxlint-disable-next-line no-process-env
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const { rows } = await client.query("SELECT title FROM notes");
    expect(rows).toEqual([{ title: "Over TCP" }]);
  } finally {
    await client.end();
  }
});
