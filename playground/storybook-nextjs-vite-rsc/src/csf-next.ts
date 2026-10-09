import type { Meta, Preview, Story } from "storybook/internal/csf";

// What the framework knows of the stories of CSF Next: for the input of a
// story, which is what Storybook has as its `moduleExport`, the story that
// made it, and the test of that story when it is one. A client story is an
// export of a file with `"use client"`, which the plugin knows by the story,
// not by its input: see render.tsx. A story context with the story of CSF
// Next it is of would replace this.

type Registered = { story: object; test?: string };

const stories = new WeakMap<object, Registered>();

/** The story of CSF Next that an input is of: what the story file exports. */
export function storyOf(input: unknown): Registered | undefined {
  return typeof input === "object" && input !== null ? stories.get(input) : undefined;
}

// A story, and every story that it makes: its tests, and what it extends to.
// A test is of the story it was made of, which the story file exports; a
// story that `extend()` makes is exported itself.
function register(story: Story<any>, exported: object = story, test?: string): Story<any> {
  stories.set(story.input, { story: exported, test });
  const defineTest = story.test.bind(story);
  story.test = ((name: string, ...rest: unknown[]) =>
    register(
      (defineTest as (...args: unknown[]) => Story<any>)(name, ...rest),
      exported,
      name,
    )) as typeof story.test;
  const extend = story.extend.bind(story);
  story.extend = ((input: never) => register(extend(input) as Story<any>)) as typeof story.extend;
  return story;
}

/** Has every story that a preview makes say what it made: see `storyOf()`. */
export function registerStories<P>(input: P): P {
  const preview = input as unknown as Preview<any>;
  const defineMeta = preview.meta.bind(preview);
  preview.meta = ((metaInput: never) => {
    const meta = defineMeta(metaInput) as Meta<any>;
    const defineStory = meta.story.bind(meta);
    meta.story = ((storyInput?: never) =>
      register(defineStory(storyInput) as Story<any>)) as typeof meta.story;
    return meta;
  }) as typeof preview.meta;
  return input;
}
