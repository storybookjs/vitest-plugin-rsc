import { cacheTag } from "next/cache";
import { getReport } from "../lib/reports.ts";

let renders = 0;

// A cached component: what it renders is kept, not only data.
async function Summary({ year }: { year: number }) {
  "use cache";
  const report = await getReport(year);
  cacheTag("summaries");
  return (
    <p>
      Summary {++renders} of report {report.runs} for {report.year}
    </p>
  );
}

export default async function Report() {
  // Two calls with the same arguments in one render are one call.
  const [first, second] = [await getReport(2026), await getReport(2026)];
  return (
    <>
      <h1>Report</h1>
      <Summary year={2026} />
      <p>One call: {String(first === second)}</p>
    </>
  );
}
