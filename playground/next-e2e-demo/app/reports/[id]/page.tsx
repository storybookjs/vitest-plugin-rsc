import { cookies } from "next/headers";
import { Suspense } from "react";
import { getReport, reports } from "../../lib/reports.ts";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function Report({ id }: { id: string }) {
  return <p>{await getReport(id)}</p>;
}

// Reads the request while the report is still being written: half way.
async function Reader() {
  await delay(reports.duration / 2);
  const session = (await cookies()).get("session")?.value;
  return <p>Read by {session ?? "a visitor"}</p>;
}

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <>
      <h1>Report {id}</h1>
      <Suspense fallback={<p>Writing the report…</p>}>
        <Report id={id} />
      </Suspense>
      <Suspense fallback={<p>Looking who reads it…</p>}>
        <Reader />
      </Suspense>
    </>
  );
}
