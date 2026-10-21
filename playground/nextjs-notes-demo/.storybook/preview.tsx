"use client";

import { definePreview } from "@storybook/nextjs-vite-rsc";
import docs from "@storybook/addon-docs";
import MockDate from "mockdate";
import { sb } from "storybook/test";
import { TEST_NOW } from "#test/now.ts";
// The styles of the app, which its root layout imports, for a story of a
// component, which renders without the layouts.
import "../app/globals.css";
import "@fontsource-variable/geist/index.css";
import "./preview.css";

// The preview of the stories of files with "use client", which render in
// the browser, and of the docs pages: the project's preview of Storybook.

// The module that vitest.setup.ts mocks, mocked the same way: the database,
// with lib/__mocks__/db.ts, in every layer. Storybook reads the mocks of
// this file only. By a relative path: `sb.mock()` resolves it from
// Storybook's package, which does not know the `imports` of this one.
sb.mock(import("../lib/db.ts"));

export default definePreview({
  addons: [docs()],
  // A component renders with room around it.
  parameters: { layout: "padded" },
  // Every story file has a docs page: a page's too, whose stories show in
  // an iframe each.
  tags: ["autodocs"],
  // The page's clock stopped at TEST_NOW, as vitest.setup.ts stops it for
  // each test: a date that a story shows is the same on every build. Once
  // for the page, before Storybook renders a story, a server story too: the
  // page has one `Date`, which the server code and PGlite read. Not reset,
  // so what the page does after a play, as a click, has the same clock.
  beforeAll: () => {
    MockDate.set(TEST_NOW);
  },
});
