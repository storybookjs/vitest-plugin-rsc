import type { BuilderOptions, StorybookConfigVite } from "@storybook/builder-vite";
import type { JSXElementConstructor, ReactNode } from "react";
import type {
  AddonTypes,
  Meta as CsfMeta,
  Preview as CsfPreview,
  Story as CsfStory,
} from "storybook/internal/csf";
import type {
  Args,
  ArgsStoryFn,
  ArgTypes,
  LoaderFunction,
  ProjectAnnotations,
  CompatibleString,
  ComponentAnnotations,
  DecoratorFunction,
  StorybookConfig as StorybookConfigBase,
  StoryAnnotations,
  StoryContext as StoryContextBase,
  WebRenderer,
} from "storybook/internal/types";

// The types of the framework: its options in `.storybook/main.ts`, the
// parameters of a story, and CSF in both of its forms.

type FrameworkName = CompatibleString<"@storybook/nextjs-vite-rsc">;
type BuilderName = CompatibleString<"@storybook/builder-vite">;

export type FrameworkOptions = {
  /** The options of `@storybook/builder-vite`. */
  builder?: BuilderOptions;
  /**
   * Modules of the preview that have to know they run in a browser, like a
   * package that the preview uses to mock the network: the `browserModules`
   * of `vitestPluginNext()`, glob patterns relative to the project root. The
   * packages of Storybook and of its addons are such modules already.
   *
   * @example ["**\/node_modules/msw/**"]
   */
  browserModules?: string[];
};

type StorybookConfigFramework = {
  framework: FrameworkName | { name: FrameworkName; options?: FrameworkOptions };
  core?: StorybookConfigBase["core"] & {
    builder?: BuilderName | { name: BuilderName; options: BuilderOptions };
  };
};

/** What `.storybook/main.ts` exports, for this framework. */
export type StorybookConfig = Omit<StorybookConfigBase, keyof StorybookConfigFramework> &
  StorybookConfigVite &
  StorybookConfigFramework;

declare module "storybook/internal/types" {
  interface StorybookFeatures {
    /**
     * Build with Vite's app builder, which builds the three layers of the
     * app: storybookjs/storybook#36690. The framework turns it on.
     */
    viteAppBuilder?: boolean;
  }
}

/**
 * The request a story renders in, as `parameters.nextjs`. There are three kinds
 * of story, and each takes these:
 *
 * - A story of a component, in a story file without `"use client"`: the
 *   component and the story's `render` are Server Components, which can be
 *   async, rendered on a route of their own.
 * - A story of a component in a story file with `"use client"`: it renders in
 *   the browser, so an arg can be a function, like a spy of `storybook/test`,
 *   and `render` can have state.
 * - A page: a story without a component and without a `render`, in a story
 *   file without `"use client"`. It opens the route of the app at `url`, in
 *   its layouts, as a browser does.
 */
export type NextJsRequest = {
  /**
   * The URL of the request. A page story needs one: it opens the route at
   * this URL. For a story of a component it is the route the component
   * renders on: what `usePathname()`, `useParams()` and
   * `useSearchParams()` read. Defaults to `/`.
   */
  url?: string;
  /**
   * Headers of the request, next to the ones a browser sends, like `cookie`.
   * They go with every request of the page to its route.
   */
  headers?: Record<string, string>;
  /**
   * For a story of a component: renders it in place of the page at `url`,
   * inside the app's layouts, which then own the document. Off by default: the
   * component renders on its own, in the canvas. A page story always has its
   * layouts.
   */
  layouts?: boolean;
  /**
   * Whether the server in front of the app takes the request: `proxy.ts`, and
   * the redirects, rewrites and headers of `next.config`. Defaults to `true`
   * for a page story, and to `false` for a story of a component.
   */
  proxy?: boolean;
};

/**
 * What a story renders: a Server Component, which can be async, or in a story
 * file with `"use client"`, a Client Component.
 */
export interface NextJsRscRenderer extends WebRenderer {
  component: JSXElementConstructor<this["T"]>;
  storyResult: ReactNode | Promise<ReactNode>;
}

/** The parameters of the framework. */
export type NextJsParameters = {
  /** The request a story renders in: see `NextJsRequest`. */
  nextjs?: NextJsRequest;
};

export interface NextJsRscTypes extends NextJsRscRenderer {
  parameters: NextJsParameters;
}

/** The default export of a story file in CSF 3. */
export type Meta<TArgs = Args> = ComponentAnnotations<NextJsRscTypes, TArgs>;
/** A named export of a story file in CSF 3. */
export type StoryObj<TArgs = Args> = StoryAnnotations<NextJsRscTypes, TArgs>;
/** A decorator: a Server Component around the story, also for a client story. */
export type Decorator<TArgs = Args> = DecoratorFunction<NextJsRscTypes, TArgs>;
/** The context of a story, as its play function and its decorators get it. */
export type StoryContext<TArgs = Args> = StoryContextBase<NextJsRscTypes, TArgs>;
/** A render function of a story in CSF 3. */
export type StoryFn<TArgs = Args> = ArgsStoryFn<NextJsRscTypes, TArgs>;
/** A loader of a story. */
export type Loader<TArgs = Args> = LoaderFunction<NextJsRscTypes, TArgs>;
/** What a `.storybook/preview.ts` of CSF 3 exports: see `definePreview()` for CSF Next. */
export type Preview = ProjectAnnotations<NextJsRscTypes>;
export type { Args, ArgTypes };

type MetaTypes<T extends AddonTypes, TArgs> = NextJsRscTypes & T & { args: TArgs };

/**
 * The preview of CSF Next: `preview.meta()` in a story file, and
 * `meta.story()` for each story. The args of `meta.story()` are the props of
 * the component, apart from the ones the meta has.
 */
export interface NextJsRscPreview<T extends AddonTypes = AddonTypes> extends Omit<
  CsfPreview<NextJsRscTypes & T>,
  "meta" | "type"
> {
  /** The preview with more types, like the args of a `render` that has its own. */
  type<R>(): NextJsRscPreview<T & R>;
  meta<TArgs extends Args, TMetaArgs extends Partial<TArgs & T["args"]> = {}>(
    meta: {
      component?: JSXElementConstructor<TArgs>;
      args?: TMetaArgs;
      render?: ArgsStoryFn<NextJsRscTypes & T, TArgs & T["args"]>;
    } & Omit<ComponentAnnotations<NextJsRscTypes & T, TArgs>, "component" | "args" | "render">,
  ): CsfMeta<
    MetaTypes<T, TArgs>,
    Omit<ComponentAnnotations<MetaTypes<T, TArgs>, TArgs>, "args"> & {
      args: Partial<TArgs> extends TMetaArgs ? {} : TMetaArgs;
    }
  >;
}

/** A story of CSF Next, as `meta.story()` makes it. */
export type NextJsRscStory = CsfStory<NextJsRscTypes>;
