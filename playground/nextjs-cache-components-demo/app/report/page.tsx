import { cacheTag } from "next/cache";
import { getReport } from "../lib/reports.ts";

let renders = 0;
let totals = 0;

// A cached component: what it renders is kept, not only data.
async function Summary({ year }: { year: number }) {
  "use cache";
  cacheTag("reports");
  const report = await getReport(year);
  return (
    <p>
      Summary {++renders} of report {report.runs} for {report.year}
    </p>
  );
}

export default async function Report() {
  // A function that closes over a value of its component.
  const unit = "EUR";
  async function getTotal(amount: number) {
    "use cache";
    return `${amount} ${unit}, computed ${++totals} times`;
  }
  return (
    <>
      <h1>Report</h1>
      <Summary year={2026} />
      <p>Total: {await getTotal(42)}</p>
    </>
  );
}
