import { defineMain } from "@storybook/nextjs-vite-rsc/node";

export default defineMain({
  stories: ["../stories/**/*.mdx", "../stories/**/*.stories.@(ts|tsx)"],
  addons: ["@storybook/addon-docs"],
  framework: {
    name: "@storybook/nextjs-vite-rsc",
    // Not the `vite.config.ts` of this directory, which is the host page's:
    // a Next.js app has none, and the framework brings the plugin itself.
    options: { builder: { viteConfigPath: ".storybook/vite.config.ts" } },
  },
});
