import type { BuilderOptions, StorybookConfigVite } from "@storybook/builder-vite";
import { __definePreview } from "@storybook/react";
import type {
  CompatibleString,
  StorybookConfig as StorybookConfigBase,
} from "storybook/internal/types";
import type { VitestPluginNextOptions } from "vitest-plugin-rsc/nextjs/plugin";
import { annotations } from "./client-story.ts";

// The entry of `.storybook/main.ts` and of `.storybook/preview.tsx`, a file
// with "use client", and of the story files that import it: they render in
// the browser layer, as ordinary stories of `@storybook/react`. The server
// stories have their own entry: `@storybook/nextjs-vite-rsc/server`.

export type { Decorator, Loader, StoryContext } from "@storybook/react";

/**
 * The project's preview, `preview.tsx`: `definePreview()` of
 * `@storybook/react`, whose first addon gives a client story the
 * page's storage and the stylesheets of its file (client-story.ts).
 */
export const definePreview: typeof __definePreview = (input) =>
  __definePreview({ ...input, addons: [annotations, ...(input.addons ?? [])] as never });

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
