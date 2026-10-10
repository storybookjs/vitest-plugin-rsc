import type { StorybookConfig as StorybookConfigBase } from "storybook/internal/types";

export type { NextjsParameters } from "./entry-preview.tsx";

export type StorybookConfig = StorybookConfigBase & {
  framework:
    | "@storybook/nextjs-vite-rsc"
    | { name: "@storybook/nextjs-vite-rsc"; options?: object };
};
