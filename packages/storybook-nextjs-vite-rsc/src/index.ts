import type { BuilderOptions, StorybookConfigVite } from "@storybook/builder-vite";
import type { ComponentProps, JSXElementConstructor, ReactNode } from "react";
import type {
  AnnotatedStoryFn,
  Args,
  ArgsFromMeta,
  ArgsStoryFn,
  ArgTypes,
  Canvas,
  CompatibleString,
  ComponentAnnotations,
  DecoratorFunction,
  LoaderFunction,
  ProjectAnnotations,
  StorybookConfig as StorybookConfigBase,
  StoryAnnotations,
  StoryContext as StoryContextBase,
  WebRenderer,
} from "storybook/internal/types";
import type { VitestPluginNextOptions } from "vitest-plugin-rsc/nextjs/plugin";

// What `.storybook/main.ts`, `.storybook/preview.tsx` and the story files
// import: types. Storybook loads `./preset` and `./preview` itself.

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

/** The request a server story renders in: `parameters.nextjs`. */
export type NextjsParameters = {
  nextjs?: {
    /**
     * The URL of the request: what `usePathname()`, `useParams()` and
     * `useSearchParams()` read. A story without `component` and `render`
     * is the page of the app at this URL, which it needs. For a component,
     * defaults to `/`.
     */
    url?: string;
    /** Headers of the requests to the app, next to a browser's, like `cookie`. */
    headers?: Record<string, string>;
    /**
     * Whether `proxy.ts` and the routing of `next.config` take the request.
     * Defaults to `true` for a page, `false` for a component.
     */
    proxy?: boolean;
    /**
     * Renders the component in place of the page at `url`, in the layouts of
     * the app, which then own the document. Not for a page, which has its
     * layouts. Defaults to `false`.
     */
    layouts?: boolean;
  };
};

/**
 * What a story renders: in a file without `"use client"` a Server Component,
 * which may be async; in a file with it a Client Component.
 */
export interface NextjsRscRenderer extends WebRenderer {
  component: JSXElementConstructor<this["T"]>;
  storyResult: ReactNode | Promise<ReactNode>;
  /** In `play`: renders the story, or `ui` in its place. */
  mount: (ui?: ReactNode) => Promise<Canvas>;
}

interface NextjsRscTypes extends NextjsRscRenderer {
  parameters: NextjsParameters;
}

// As `@storybook/react` types them, with the framework's renderer.

type Simplify<T> = { [K in keyof T]: T[K] } & {};
type SetOptional<T, K extends keyof T> = Simplify<Omit<T, K> & Partial<Pick<T, K>>>;
// A spy of `fn()` in the meta's args keeps its type in the story's.
type AddMocks<TArgs, DefaultArgs> = Simplify<{
  [K in keyof TArgs]: K extends keyof DefaultArgs
    ? DefaultArgs[K] extends ((...args: never[]) => unknown) & { mock: {} }
      ? DefaultArgs[K]
      : TArgs[K]
    : TArgs[K];
}>;
// oxlint-disable-next-line no-explicit-any
type AnyComponent = JSXElementConstructor<any>;

/** The default export of a story file: `Meta<typeof Component>`. */
export type Meta<TCmpOrArgs = Args> = [TCmpOrArgs] extends [AnyComponent]
  ? ComponentAnnotations<NextjsRscTypes, ComponentProps<TCmpOrArgs>>
  : ComponentAnnotations<NextjsRscTypes, TCmpOrArgs>;

/** A story, a named export of a story file: `StoryObj<typeof meta>`. */
export type StoryObj<TMetaOrCmpOrArgs = Args> = [TMetaOrCmpOrArgs] extends [
  {
    // oxlint-disable-next-line no-explicit-any
    render?: ArgsStoryFn<NextjsRscTypes, any>;
    component?: infer Component;
    args?: infer DefaultArgs;
  },
]
  ? Simplify<
      (Component extends AnyComponent ? ComponentProps<Component> : unknown) &
        ArgsFromMeta<NextjsRscTypes, TMetaOrCmpOrArgs>
    > extends infer TArgs
    ? StoryAnnotations<
        NextjsRscTypes,
        AddMocks<TArgs, DefaultArgs>,
        SetOptional<TArgs, keyof TArgs & keyof DefaultArgs>
      >
    : never
  : TMetaOrCmpOrArgs extends AnyComponent
    ? StoryAnnotations<NextjsRscTypes, ComponentProps<TMetaOrCmpOrArgs>>
    : StoryAnnotations<NextjsRscTypes, TMetaOrCmpOrArgs>;

/**
 * A decorator: a function that returns elements. In a story file without
 * `"use client"` it may be async, as a Server Component. For a client story
 * it is synchronous, also one of the preview file, which is server code: a
 * hook of React goes in a component of a file with `"use client"` that it
 * renders.
 */
export type Decorator<TArgs = Args> = DecoratorFunction<NextjsRscTypes, TArgs>;
/** The context of a story, as `play`, `render` and a decorator get it. */
export type StoryContext<TArgs = Args> = StoryContextBase<NextjsRscTypes, TArgs>;
/** A story as a function. */
export type StoryFn<TCmpOrArgs = Args> = [TCmpOrArgs] extends [AnyComponent]
  ? AnnotatedStoryFn<NextjsRscTypes, ComponentProps<TCmpOrArgs>>
  : AnnotatedStoryFn<NextjsRscTypes, TCmpOrArgs>;
/** A loader. */
export type Loader<TArgs = Args> = LoaderFunction<NextjsRscTypes, TArgs>;
/** What `.storybook/preview.tsx` exports. */
export type Preview = ProjectAnnotations<NextjsRscTypes>;
export type { Args, ArgTypes };
