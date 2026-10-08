import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import schemaSql from "virtual:nextjs-notes-demo/schema-sql";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import * as schema from "#db/schema.ts";
import * as dbModule from "#lib/db.ts";
import { signInAs, testUser } from "#test/auth.ts";

// The host of the notes app: what `vitest.setup.ts` and a test file are to
// the tests. It runs in the rsc layer, so the database it makes is the one
// the pages read, and the user it signs in is the one they see.
const { resetDb } = dbModule as typeof import("#lib/__mocks__/db.ts");

const client = await PGlite.create("memory://");
await client.exec(schemaSql);
resetDb(drizzle(client, { schema }));

// What the page shows is in its query: `?url=/notes` for a page of the app,
// and `?user=none` for a visitor who is not signed in.
const query = new URLSearchParams(window.location.search);
const state = window as {
  __hostState?: string;
  __hostError?: unknown;
  __hostResponse?: { status: number; url: string; redirected: boolean };
};
try {
  if (query.get("user") !== "none") {
    await signInAs();
    await dbModule.db.insert(schema.notes).values([
      {
        id: "33333333-3333-4333-8333-333333333333",
        ownerId: testUser.id,
        title: "Seeded by the host",
        content: "From host/main.tsx",
        isFavorite: true,
      },
      { ownerId: testUser.id, title: "Groceries", content: "Oat milk, coffee" },
    ]);
  }
  const { response } = await renderServer({ url: query.get("url") ?? "/notes" });
  state.__hostResponse = {
    status: response.status,
    url: response.url,
    redirected: response.redirected,
  };
  state.__hostState = "ready";
} catch (error) {
  state.__hostState = "error";
  state.__hostError = error;
  console.error(error);
}
