import type { BuilderOptions, StorybookConfigVite } from "@storybook/builder-vite";
import type {
  CompatibleString,
  StorybookConfig as StorybookConfigBase,
} from "storybook/internal/types";
import type { VitestPluginNextOptions } from "vitest-plugin-rsc/nextjs/plugin";

// The entry of `.storybook/main.ts` and of `.storybook/preview.tsx`, a file
// with "use client", and of the story files that import it: they render in
// the browser layer, as ordinary stories of `@storybook/react`. The server
// stories have their own entry: `@storybook/nextjs-vite-rsc/server`.

export { __definePreview as definePreview } from "@storybook/react";
export type { Decorator, Loader, StoryContext } from "@storybook/react";

type FrameworkName = CompatibleString<"@storybook/nextjs-vite-rsc">;

/** The options of the framework in `.storybook/main.ts`. */
export type FrameworkOptions = {
  /** The options of `@storybook/builder-vite`, like `viteConfigPath`. */
  builder?: BuilderOptions;
  /** React's `<StrictMode>` around a client story, as `@storybook/react` has it. */
  strictMode?: boolean;
} & Pick<VitestPluginNextOptions, "build" | "browserModules">;

/** What `.storybook/main.ts` exports. */
export type StorybookConfig = Omit<StorybookConfigBase, "framework"> &
  StorybookConfigVite & {
    framework: FrameworkName | { name: FrameworkName; options?: FrameworkOptions };
  };
