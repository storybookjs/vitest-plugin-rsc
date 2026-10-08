import type { StorybookConfig } from "@storybook/nextjs-vite-rsc";

const config: StorybookConfig = {
  stories: ["../stories/**/*.stories.@(ts|tsx)"],
  framework: {
    name: "@storybook/nextjs-vite-rsc",
    // Not the `vite.config.ts` of this directory, which is the host page's:
    // a Next.js app has none, and the framework brings the plugin itself.
    options: { builder: { viteConfigPath: ".storybook/vite.config.ts" } },
  },
};

export default config;
