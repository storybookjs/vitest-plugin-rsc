import "server-only";

// A file of the host without "use client", `host.files` in vitest.config.ts,
// which test files with the directive and without it import: server code,
// evaluated once, by the page. A file with the directive gets the page's
// instance: see app/host-file.test.tsx and app/host-file-client.test.tsx.
export const shared = { version: 1 };

// Every evaluation of the file in the tab, for the tests to count.
export type Evaluations = { __vitestSharedEvaluations?: object[] };
((globalThis as Evaluations).__vitestSharedEvaluations ??= []).push(shared);
