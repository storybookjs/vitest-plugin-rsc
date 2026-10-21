import { getStoryChildren } from "storybook/internal/csf";
import { expect, expectTypeOf, test, vi } from "vitest";
import { defineServerPreview } from "./server.ts";

vi.mock("vitest-plugin-rsc/nextjs/testing-library", () => ({}));

const Card = () => null;
const preview = defineServerPreview({});
const layoutOf = (story: { composed: { parameters: { layout?: string } } }) =>
  story.composed.parameters.layout;

test("a page and a component in the app's layouts own the document", () => {
  const pages = preview.meta({});
  const cards = preview.meta({ component: Card });
  expect(layoutOf(pages.story({ parameters: { nextjs: { url: "/" } } }))).toBe("document");
  expect(layoutOf(cards.story({ parameters: { nextjs: { layouts: true } } }))).toBe("document");
  expect(layoutOf(cards.story())).toBeUndefined();
  // A render of its own renders in Storybook's root, at any URL.
  expect(layoutOf(pages.story(() => null))).toBeUndefined();
  expect(layoutOf(pages.story({ render: () => null }))).toBeUndefined();
  expect(layoutOf(preview.meta({ render: () => null }).story())).toBeUndefined();
});

test("the layouts of the meta and the preview, and the story's over them", () => {
  const inLayouts = defineServerPreview({ parameters: { nextjs: { layouts: true } } });
  const cards = inLayouts.meta({ component: Card });
  expect(layoutOf(cards.story())).toBe("document");
  expect(layoutOf(cards.story({ parameters: { nextjs: { layouts: false } } }))).toBeUndefined();
  const meta = preview.meta({ component: Card, parameters: { nextjs: { layouts: true } } });
  expect(layoutOf(meta.story())).toBe("document");
});

test("a story that owns the document has its layout over the user's", () => {
  const story = preview
    .meta({})
    .story({ parameters: { layout: "centered", nextjs: { url: "/" } } });
  expect(layoutOf(story)).toBe("document");
  expect(
    layoutOf(preview.meta({ component: Card }).story({ parameters: { layout: "centered" } })),
  ).toBe("centered");
});

test("the input the user gave stays as it is", () => {
  const parameters = { layout: "centered" as const, nextjs: { url: "/" } };
  const input = { parameters };
  const page = preview.meta({}).story(input);
  expect(layoutOf(page)).toBe("document");
  expect(input).toEqual({ parameters: { layout: "centered", nextjs: { url: "/" } } });
  expect(input.parameters).toBe(parameters);
});

test("extend() and test() derive it again", () => {
  const page = preview.meta({}).story({ parameters: { nextjs: { url: "/" } } });
  expect(layoutOf(page.extend({ args: {} }))).toBe("document");
  expect(layoutOf(page.extend({ render: () => null }))).toBeUndefined();
  const card = preview.meta({ component: Card }).story();
  expect(layoutOf(card.extend({ parameters: { nextjs: { layouts: true } } }))).toBe("document");
  // The user's layout, which the page's own was over.
  const centered = preview
    .meta({})
    .story({ parameters: { layout: "centered", nextjs: { url: "/" } } });
  expect(layoutOf(centered.extend({ render: () => null }))).toBe("centered");
  page.test("a test of a page", () => {});
  expect(getStoryChildren(page).map(layoutOf)).toEqual(["document"]);
});

test("a URL of the story's args and globals, which the story keeps as a function", () => {
  const url = ({ args }: { args: { step: string } }) => `/session/${args.step}`;
  const pages = preview.meta({}).type<{ args: { step: string } }>();
  const story = pages.story({ args: { step: "1.0" }, parameters: { nextjs: { url } } });
  expect(story.composed.parameters.nextjs.url).toBe(url);
  expect(layoutOf(story)).toBe("document");
  // The args of the story type the context.
  pages.story({
    args: { step: "2.0" },
    parameters: {
      nextjs: {
        url: ({ args }) => {
          expectTypeOf(args.step).toEqualTypeOf<string>();
          return `/session/${args.step}`;
        },
      },
    },
  });
  // On the meta too, with the args of its component.
  const Step = (_: { label: string }) => null;
  preview.meta({
    component: Step,
    parameters: {
      nextjs: {
        url: ({ args }) => {
          expectTypeOf(args.label).toEqualTypeOf<string>();
          return `/session/${args.label}`;
        },
      },
    },
  });
  preview.meta({ component: Card }).story({
    parameters: { nextjs: { url: ({ globals }) => `/${globals.locale}` } },
  });
});
