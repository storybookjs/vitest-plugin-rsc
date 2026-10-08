import { use, useEffect, useMemo, type ComponentType, type ReactNode } from "react";
import { HooksContext, normalizeStory, prepareStory } from "storybook/preview-api";
import { importClientModule } from "vitest-plugin-rsc/nextjs/client-node";

// A story of a file with `"use client"`, in the browser layer: what the
// preview renders for one, see entry-preview.tsx.
//
// The preview has imported the story file once, for Storybook to read. A page
// has a module graph of its own, and CSF keeps what it imports where a story
// does not read it again: `component: Button` is the `Button` of the page
// that was open when the file loaded. So the page imports the story file
// itself, and composes the story from that: its render function, and the
// decorators of the story and of its meta. The args and the rest of the
// context are the preview's own, so a spy in an arg is the one the play
// function asserts on and the Actions panel logs.
//
// `storybook/preview-api` is the preview's instance: see the host modules of
// vitest-plugin-rsc.

type Context = {
  id: string;
  title: string;
  componentId: string;
  component?: ComponentType<Record<string, unknown>>;
  [key: string]: unknown;
};

type Prepared = {
  component?: Context["component"];
  originalStoryFn: unknown;
  unboundStoryFn(context: Context): ReactNode;
};

const prepare = prepareStory as unknown as (
  story: object,
  meta: object,
  project: object,
) => Prepared;
const normalize = normalizeStory as unknown as (
  name: string,
  story: unknown,
  meta: object,
) => object;

/** A story without a `render` is its component, with the args. */
function render(args: Record<string, unknown>, { id, component: Component }: Context): ReactNode {
  if (!Component) {
    throw new Error(`Unable to render story ${id}: give it a component, or a render function.`);
  }
  return <Component {...args} />;
}

export function ClientStory({
  file,
  name,
  context,
}: {
  /** What the browser layer imports the story file by. */
  file: string;
  /** The export of it that is the story. */
  name: string;
  /** The context of the story, as the preview has it now. */
  context(): Context;
}): ReactNode {
  const csf = use(importClientModule<Record<string, unknown>>(file));
  // What Storybook worked out for the file, which its meta may leave out.
  const { title, componentId } = context();
  const story = useMemo(() => {
    const meta = { ...(csf.default as object), title, id: componentId };
    return prepare(normalize(name, csf[name], meta), meta, { render });
  }, [csf, name, title, componentId]);
  // The decorators here have their own hooks of Storybook: the ones of the
  // preview are for the decorators it runs on the server.
  const hooks = useMemo(() => new HooksContext(), []);
  useEffect(() => () => hooks.clean(), [hooks]);
  return story.unboundStoryFn({
    ...context(),
    component: story.component,
    originalStoryFn: story.originalStoryFn,
    hooks,
  });
}
