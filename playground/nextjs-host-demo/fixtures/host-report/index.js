// A package of the host, with state of the page: what `vitest` is to a test
// file, whose `test()` collects for the file that is being imported. A file
// with `"use client"` runs in the browser layer, and has to reach this one
// instance: see `host.packages` in ../../vite.config.ts.
export const reports = [];

export function report(entry) {
  reports.push(entry);
}
