import type { Preview } from "@storybook/nextjs-vite-rsc";
import { sb } from "storybook/test";
// The styles of the app, which its root layout imports, for a story of a
// component, which renders without the layouts.
import "../app/globals.css";
import "@fontsource-variable/geist/index.css";
import "./preview.css";

// The modules that vitest.setup.ts mocks, mocked the same way: with the files
// in lib/__mocks__. By a relative path: `sb.mock()` resolves it from
// Storybook's package, which does not know the `imports` of this one.
sb.mock(import("../lib/db.ts"));
// What `#lib/db.ts` is under the `development` condition, which `storybook
// dev` resolves with: see package.json.
sb.mock(import("../lib/db.dev.ts"));
sb.mock(import("../lib/auth.ts"));
sb.mock(import("../lib/auth-session.ts"));
sb.mock(import("../lib/flash-cookie.ts"));

export default {
  // A component renders with room around it. A page owns the document, and
  // the app styles its own `<body>`.
  parameters: { layout: "padded" },
  // What vitest.setup.ts does before every test. The browser layer evaluates
  // this file too, for its decorators, and has no database: data.ts loads
  // only where `beforeEach` runs, in the rsc layer.
  beforeEach: async () => (await import("./data.ts")).reset(),
} satisfies Preview;
