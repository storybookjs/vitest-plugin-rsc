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
} from "storybook/internal/csf";
import type {
  Args,
  ArgsStoryFn,
  Canvas,
  DecoratorFunction,
  ProjectAnnotations,
  WebRenderer,
} from "storybook/internal/types";
import { beforeAllInServerPreview } from "./errors.ts";
import { annotations } from "./server-renderer.ts";

// The entry of `.storybook/preview.server.tsx`, a file without "use client",
// and of the story files that import it: server code. Its stories render on
// the server through the plugin (server-renderer.ts).

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

// A mark of the server preview, of every evaluation of this module.
const serverPreview = Symbol.for("@storybook/nextjs-vite-rsc/server-preview");

/**
 * The preview of the server stories. Storybook reads `beforeAll`, globals
 * and the tags of the index from `.storybook/preview.tsx` only, so this
 * preview has none of them: no `beforeAll` (an error), only globals that
 * preview.tsx declares (an error when a story file loads), and tags in it
 * do not reach the sidebar, autodocs or test filtering.
 */
export function defineServerPreview<Addons extends PreviewAddonEntry[] = []>(
  input: ProjectAnnotations<ServerTypes & InferTypes<Addons>> & { addons?: Addons },
): ServerPreview<InferTypes<Addons>> {
  if (input.beforeAll) throw beforeAllInServerPreview();
  return Object.assign(
    definePreview({ ...input, addons: [argTypes, annotations, ...(input.addons ?? [])] }),
    { [serverPreview]: true },
  ) as never;
}

/** Whether a preview is made with `defineServerPreview()`. */
export const isServerPreview = (preview: object): boolean => serverPreview in preview;
