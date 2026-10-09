import type { StorybookConfig } from "../types.ts";

/**
 * `.storybook/main.ts`, with the types of the framework.
 *
 * @example
 *   import { defineMain } from "@storybook/nextjs-vite-rsc/node";
 *
 *   export default defineMain({
 *     framework: "@storybook/nextjs-vite-rsc",
 *     stories: ["../app/**\/*.stories.tsx"],
 *   });
 */
export function defineMain(config: StorybookConfig): StorybookConfig {
  return config;
}
