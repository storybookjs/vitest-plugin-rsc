import type { Metadata } from "next";
import { visit } from "../actions.ts";
import { countVisits } from "../lib/visits.ts";

export const metadata: Metadata = { title: "Visits" };

// Reads the database that its Server Action writes to.
export default async function VisitsPage() {
  return (
    <>
      <h1>Visits</h1>
      <p>Visits: {await countVisits()}</p>
      <form action={visit}>
        <button>Visit</button>
      </form>
    </>
  );
}
