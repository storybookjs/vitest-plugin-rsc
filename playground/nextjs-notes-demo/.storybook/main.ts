import { fileURLToPath } from "node:url";
import type { StorybookConfig } from "@storybook/nextjs-vite-rsc";

// Google Fonts, without the network: as in vitest.config.ts.
// oxlint-disable-next-line no-process-env
process.env.NEXT_FONT_GOOGLE_MOCKED_RESPONSES = fileURLToPath(
  new URL("../../../vitest.google-fonts.cjs", import.meta.url),
);

export default {
  stories: ["../**/*.@(mdx|stories.tsx)"],
  addons: ["@storybook/addon-docs"],
  framework: {
    name: "@storybook/nextjs-vite-rsc",
    // Not the vite.config.ts of the project, which is `next dev`'s: see
    // vite.config.ts here.
    options: { builder: { viteConfigPath: ".storybook/vite.config.ts" } },
  },
} satisfies StorybookConfig;
