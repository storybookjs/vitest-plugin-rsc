import { eq } from "drizzle-orm";
import { test } from "vitest";
import { db } from "#lib/db.ts";
import { notes, sessions, users } from "#lib/schema.ts";
import { seedNotes } from "#test/db.ts";
import { resetDb, seedApp } from "./app.ts";
import { measure } from "./harness.ts";

// The database from test code: the app's `db`, drizzle on PGlite in the page.

test("select the notes of a user", async () => {
  const { user } = await seedApp();
  await measure(
    "DB › SELECT the notes of a user (20 rows)",
    async () => {
      await db.select().from(notes).where(eq(notes.ownerId, user.id));
    },
    { batch: 10 },
  );
});

test("insert a note", async () => {
  const { user } = await seedApp();
  await measure(
    "DB › INSERT a note, returning it",
    async ({ i }) => {
      await db
        .insert(notes)
        .values({ ownerId: user.id, title: `Inserted ${i}` })
        .returning();
    },
    { batch: 10 },
  );
});

test("resetDb", async () => {
  // The rows of the primitives before, which no seedApp() here empties.
  await resetDb();
  await measure("DB › resetDb() of a user, a session and 20 notes", () => resetDb(), {
    // Without hashing a password, which fidelity mode does for real.
    before: async () => {
      const [user] = await db
        .insert(users)
        .values({ name: "Ada", email: "ada@example.com", passwordHash: "-" })
        .returning();
      await db.insert(sessions).values({ token: crypto.randomUUID(), userId: user!.id });
      await seedNotes(
        user!.id,
        Array.from({ length: 20 }, (_, i) => ({ title: `Note ${i}` })),
      );
    },
  });
});
