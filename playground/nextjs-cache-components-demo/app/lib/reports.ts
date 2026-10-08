"use cache";

import { cacheTag } from "next/cache";

let runs = 0;

// A module with the directive: every function it exports is cached.
export async function getReport(year: number) {
  cacheTag("reports");
  return { year, runs: ++runs };
}
