import { notes } from "#db/schema.ts";
import { db } from "#lib/db.ts";

// Notes that read like someone's own, for the stories of a filled app. The
// dates are fixed, so a story looks the same every day.
const samples = [
  {
    title: "Product roadmap Q3",
    content: "Ship offline sync first, then shared notebooks. Revisit pricing after the beta.",
  },
  {
    title: "Team offsite agenda",
    content: "Day 1: retro and planning. Day 2: hack day, demos at four.",
  },
  {
    title: "Book recommendations",
    content: "The Pragmatic Programmer, A Philosophy of Software Design, Shape Up.",
  },
  { title: "Groceries", content: "Oat milk, sourdough, basil, cherry tomatoes, coffee beans." },
  {
    title: "Conference talk ideas",
    content: "Testing React Server Components without a server: a story for every route.",
  },
  { title: "Weekend plan", content: "Farmers market, bike to the lake, call grandma." },
];

/** Gives the user `count` notes, the first two of them favorites. */
export function seedNotes(ownerId: string, count: number) {
  if (count === 0) return [];
  return db
    .insert(notes)
    .values(
      Array.from({ length: count }, (_, index) => {
        const sample = samples[index % samples.length]!;
        const round = Math.floor(index / samples.length);
        const updatedAt = new Date(Date.UTC(2026, 7, 21 - index, 9));
        return {
          ownerId,
          title: round ? `${sample.title} (${round + 1})` : sample.title,
          content: sample.content,
          isFavorite: index < 2,
          createdAt: updatedAt,
          updatedAt,
        };
      }),
    )
    .returning();
}
