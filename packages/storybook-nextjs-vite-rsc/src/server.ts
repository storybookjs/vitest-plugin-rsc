import type { ComponentType, ReactNode } from "react";
import * as argTypes from "@storybook/react/entry-preview-argtypes";
import {
  definePreview,
  type AddonTypes,
  type InferTypes,
  type Meta,
  type MetaInput,
  type MetaTypes,
  type Preview,
  type PreviewAddonEntry,
  type Story,
} from "storybook/internal/csf";
import type {
  Args,
  ArgsStoryFn,
  Canvas,
  DecoratorFunction,
  ProjectAnnotations,
  Renderer,
  WebRenderer,
} from "storybook/internal/types";
import { beforeAllInServerPreview } from "./errors.ts";
import { markServerPreview } from "./server-mark.ts";
import { annotations, isPage, nextjsOf } from "./server-renderer.ts";

// The entry of `.storybook/preview.server.tsx`, a file without "use client",
// and of the story files that import it: server code, whose stories render
// through the plugin (server-renderer.ts). Its factories say what Storybook
// needs to know of each server story.

/** The request a server story renders in: `parameters.nextjs`. */
export type NextjsParameters = {
  nextjs?: {
    /**
     * The URL of the request, which `usePathname()` and `useParams()` read.
     * A story without `component` and `render` is the page at this URL.
     * Defaults to `/` for a component.
     */
    url?: string;
    /** Headers of the requests to the app, next to a browser's, like `cookie`. */
    headers?: Record<string, string>;
    /** Whether `proxy.ts` and the routing of `next.config` take it: by default for a page only. */
    proxy?: boolean;
    /** The component in place of the page at `url`, in the app's layouts. A page is in them anyway. */
    layouts?: boolean;
  };
};

/** What a server story renders: a Server Component, which may be async. */
export interface NextjsServerRenderer extends WebRenderer {
  component: ComponentType<this["T"]>;
  storyResult: ReactNode | Promise<ReactNode>;
  /** In `play`: renders the story, or `ui` in its place. */
  mount: (ui?: ReactNode) => Promise<Canvas>;
}

type ServerTypes = NextjsServerRenderer & { parameters: NextjsParameters };

/** The server preview: `preview.meta()` for the story files without "use client". */
export interface ServerPreview<T extends AddonTypes> extends Omit<
  Preview<ServerTypes & T>,
  "meta" | "type"
> {
  type<R>(): ServerPreview<T & R>;
  meta<
    TArgs extends Args,
    // oxlint-disable-next-line no-explicit-any
    Decorators extends DecoratorFunction<ServerTypes & T, any>,
    TMetaArgKeys extends PropertyKey = never,
  >(
    meta: {
      render?: ArgsStoryFn<ServerTypes & T, TArgs & T["args"]>;
      component?: ComponentType<TArgs>;
    } & MetaInput<ServerTypes & T, TArgs, Decorators, TMetaArgKeys>,
  ): Meta<MetaTypes<ServerTypes & T, TArgs, Decorators, TMetaArgKeys>, TMetaArgKeys>;
}

/**
 * The preview of the server stories. Storybook reads `beforeAll`, the
 * globals and the index's tags from `.storybook/preview.tsx` only: tags here
 * do not reach the sidebar, autodocs or test filtering.
 */
export function defineServerPreview<Addons extends PreviewAddonEntry[] = []>(
  input: ProjectAnnotations<ServerTypes & InferTypes<Addons>> & { addons?: Addons },
): ServerPreview<InferTypes<Addons>> {
  if (input.beforeAll) throw beforeAllInServerPreview();
  const preview: Preview<Renderer> = definePreview({
    ...input,
    addons: [argTypes, annotations, ...(input.addons ?? [])],
  }) as never;
  const defineMeta = preview.meta;
  return Object.assign(markServerPreview(preview), {
    meta: (input: Meta<Renderer>["input"]) => {
      const meta: Meta<Renderer> = defineMeta.call(preview, input) as never;
      const { story } = meta;
      // A copy of the story's input, which the factory amends.
      meta.story = ((input: Parameters<typeof story>[0] = {}) =>
        serverStory(
          story.call(meta, typeof input === "function" ? input : { ...input }),
        )) as typeof story;
      return meta;
    },
  }) as never;
}

/**
 * `layout: "document"` for a story of the server preview that owns the
 * document, a page or a component in the app's layouts, over a user's value,
 * which Storybook's view and docs read: its `<body>` is its root, and a docs
 * page shows it in an iframe. Again on each story that `extend()` and
 * `test()` make of it, where one that no longer owns the document loses it.
 * It amends the input that core's factory made the story of, which core
 * composes only when the story is first read, as `@storybook/react`'s
 * `preview.meta()` amends the stories it makes.
 */
function serverStory(story: Story<Renderer>): Story<Renderer> {
  const { input, meta } = story;
  const { preview } = meta;
  const { layout, ...parameters } = input.parameters ?? {};
  const layouts =
    nextjsOf(input).layouts ?? nextjsOf(meta.input).layouts ?? nextjsOf(preview.composed).layouts;
  const render = input.render ?? meta.input.render ?? preview.composed.render;
  const ownsDocument = layouts || isPage(meta.input.component, render);
  if (ownsDocument) input.parameters = { ...parameters, layout: "document" };
  else if (layout === "document") input.parameters = parameters;
  const { extend } = story;
  story.extend = ((input: Story<Renderer>["input"]) =>
    serverStory(extend.call(story, input))) as typeof extend;
  return story;
}
