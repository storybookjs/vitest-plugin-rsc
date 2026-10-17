import type { StorybookConfig } from "@storybook/nextjs-vite-rsc";

export default {
  stories: ["../stories/**/*.stories.tsx"],
  framework: {
    name: "@storybook/nextjs-vite-rsc",
    // Not the vite.config.ts of the project, which is the host page's, with
    // the plugin in it: the framework brings the plugin itself.
    options: { builder: { viteConfigPath: ".storybook/vite.config.ts" } },
  },
} satisfies StorybookConfig;
