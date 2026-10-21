import type { now as appNow } from "../clock.ts";

// `#lib/clock.ts` in the tests and the stories, which vitest.setup.ts and
// .storybook/preview.tsx mock with this file: one instant, so that a note
// that a test or a story writes shows the same date on every run.
export const now: typeof appNow = () => new Date("2026-01-15T12:00:00.000Z");
