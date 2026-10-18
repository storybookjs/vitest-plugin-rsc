// What `sb.mock()` in .storybook/preview.tsx takes for lib/db.dev.ts, which
// `#lib/db.ts` is under the `development` condition: the mock of lib/db.ts,
// so that both are one database.
export * from "./db.ts";
