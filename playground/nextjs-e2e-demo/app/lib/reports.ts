import { unstable_cache } from "next/cache";

// What a test sets and reads: who writes the reports, how long one takes or
// what it waits for, and how many were written.
export const reports = {
  author: "nobody",
  duration: 0,
  waitFor: undefined as Promise<void> | undefined,
  written: 0,
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// A slow computation that Next's Data Cache keeps, under the tag "reports".
export const getReport = unstable_cache(
  async (id: string) => {
    await (reports.waitFor ?? delay(reports.duration));
    reports.written += 1;
    return `Report ${id} by ${reports.author}, number ${reports.written}`;
  },
  ["report"],
  { tags: ["reports"] },
);
