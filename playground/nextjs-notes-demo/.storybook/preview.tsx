"use client";

import { definePreview } from "@storybook/nextjs-vite-rsc";
import docs from "@storybook/addon-docs";
import { sb } from "storybook/test";
// The styles of the app, which its root layout imports, for a story of a
// component, which renders without the layouts.
import "../app/globals.css";
import "@fontsource-variable/geist/index.css";
import "./preview.css";

// The preview of the stories of files with "use client", which render in
// the browser, and of the docs pages: the project's preview of Storybook.

// The modules that vitest.setup.ts mocks, mocked the same way, in every
// layer: the database, with lib/__mocks__/db.ts, and the clock, with
// lib/__mocks__/clock.ts. Storybook reads the mocks of this file only. By a
// relative path: `sb.mock()` resolves them from Storybook's package, which
// does not know the `imports` of this one.
sb.mock(import("../lib/db.ts"));
sb.mock(import("../lib/clock.ts"));

export default definePreview({
  addons: [docs()],
  // A component renders with room around it.
  parameters: { layout: "padded" },
  // Every story file has a docs page: a page's too, whose stories show in
  // an iframe each.
  tags: ["autodocs"],
});
