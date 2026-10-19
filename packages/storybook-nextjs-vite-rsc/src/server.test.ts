import { getStoryChildren } from "storybook/internal/csf";
import { expect, test, vi } from "vitest";
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

test("extend() and test() derive it again", () => {
  const page = preview.meta({}).story({ parameters: { nextjs: { url: "/" } } });
  expect(layoutOf(page.extend({ args: {} }))).toBe("document");
  expect(layoutOf(page.extend({ render: () => null }))).toBeUndefined();
  const card = preview.meta({ component: Card }).story();
  expect(layoutOf(card.extend({ parameters: { nextjs: { layouts: true } } }))).toBe("document");
  page.test("a test of a page", () => {});
  expect(getStoryChildren(page).map(layoutOf)).toEqual(["document"]);
});

test("a docs page never plays a server story", () => {
  const docsStoryOf = (story: { composed: { parameters: { docs?: { story?: object } } } }) =>
    story.composed.parameters.docs?.story;
  const playing = { docs: { story: { autoplay: true } } };
  const page = preview
    .meta({ parameters: playing })
    .story({ parameters: { nextjs: { url: "/" } } });
  const card = preview.meta({ component: Card }).story({ parameters: playing });
  expect(docsStoryOf(page)).toEqual({ inline: false, autoplay: false });
  expect(docsStoryOf(card)).toEqual({ inline: false, autoplay: false });
  expect(docsStoryOf(card.extend({ parameters: playing }))).toEqual({
    inline: false,
    autoplay: false,
  });
});
