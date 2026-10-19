import { defineServerPreview } from "@storybook/nextjs-vite-rsc/server";
import { reset } from "./data.ts";
// The styles of the app, for a story of a component, as in preview.tsx.
import "../app/globals.css";
import "@fontsource-variable/geist/index.css";
import "./preview.css";

// The preview of the stories of files without "use client", which render on
// the server: server code, as the app's routes are.
export default defineServerPreview({
  // A component renders with room around it. A page owns the document, and
  // the app styles its own `<body>`.
  parameters: { layout: "padded" },
  // What vitest.setup.ts does before every test, in the layer of the app's
  // server code, which has the database.
  beforeEach: reset,
});
