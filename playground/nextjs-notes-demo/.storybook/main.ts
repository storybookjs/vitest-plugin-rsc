import { fileURLToPath } from "node:url";
import type { StorybookConfig } from "@storybook/nextjs-vite-rsc";
import type { NextBuild } from "vitest-plugin-rsc/nextjs/plugin";

// Google Fonts, without the network: as in vitest.config.ts.
// oxlint-disable-next-line no-process-env
process.env.NEXT_FONT_GOOGLE_MOCKED_RESPONSES = fileURLToPath(
  new URL("../../../vitest.google-fonts.cjs", import.meta.url),
);

// Next's production code with `VITEST_PLUGIN_RSC_BUILD=production`, which CI
// runs the stories with too, as vitest.config.ts has it. Unset, the default
// of the command: `storybook build` builds production.
// oxlint-disable-next-line no-process-env
const build = process.env.VITEST_PLUGIN_RSC_BUILD as NextBuild | undefined;

export default {
  stories: ["../**/*.@(mdx|stories.tsx)"],
  addons: ["@storybook/addon-docs", "@storybook/addon-vitest"],
  framework: {
    name: "@storybook/nextjs-vite-rsc",
    // Not the vite.config.ts of the project, which is `next dev`'s: see
    // vite.config.ts here.
    options: { builder: { viteConfigPath: ".storybook/vite.config.ts" }, ...(build && { build }) },
  },
} satisfies StorybookConfig;
