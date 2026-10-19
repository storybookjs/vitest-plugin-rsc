import { seed } from "drizzle-seed";
import * as schema from "#db/schema.ts";
import { env } from "#env/server.ts";
import { db } from "#lib/db.ts";

export type Scenario = "notes-basic" | "notes-many";

const noteTitles = [
  "Trip ideas",
  "Meeting notes",
  "Bug backlog",
  "Reading list",
  "Launch checklist",
  "Groceries",
  "Journal entry",
  "Research tasks",
  "Release notes",
  "Weekend plan",
  "Design feedback",
  "Daily review",
  "Inbox cleanup",
  "Refactor notes",
  "API follow-ups",
  "Team retro",
  "Onboarding checklist",
  "Test ideas",
  "Product questions",
  "Draft announcement",
  "Performance notes",
  "Polish pass",
  "Support handoff",
  "Migration checklist",
  "Roadmap thoughts",
  "Story ideas",
  "Changelog draft",
  "Errands",
  "Docs to update",
  "Feature spikes",
  "Release prep",
];

const scenarioSeeds = {
  "notes-basic": 101,
  "notes-many": 202,
} as const;

export const scenarioUsers = {
  notesOwner: {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Notes Owner",
    email: "notes-owner@example.com",
    emailVerified: true,
    role: "user",
  },
} as const;

async function seedNotes(count: number, seedValue: number) {
  await db.insert(schema.user).values(scenarioUsers.notesOwner).onConflictDoNothing();

  await seed(
    db,
    { notes: schema.notes },
    { count, ...(env.NODE_ENV === "test" && { seed: seedValue }) },
  ).refine((funcs) => ({
    notes: {
      columns: {
        title: funcs.valuesFromArray({ values: noteTitles, isUnique: true }),
        content: funcs.loremIpsum({ sentencesCount: 3 }),
        ownerId: funcs.valuesFromArray({ values: [scenarioUsers.notesOwner.id] }),
        isFavorite: funcs.valuesFromArray({
          values: [
            { weight: 0.3, values: [true] },
            { weight: 0.7, values: [false] },
          ],
        }),
      },
    },
  }));
}

export async function applyScenario(scenario: Scenario) {
  switch (scenario) {
    case "notes-basic":
      await seedNotes(3, scenarioSeeds["notes-basic"]);
      return;

    case "notes-many":
      await seedNotes(24, scenarioSeeds["notes-many"]);
      return;
  }
}
