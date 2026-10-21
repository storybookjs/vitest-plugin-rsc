import { expect, test, vi } from "vitest";
import { beforeEach, render, renderToCanvas } from "./server-renderer.ts";

// What the story asks of the plugin: a page at a URL, or a node on one, and
// its renders again in place.
const requests = vi.hoisted((): { url?: string; node: boolean }[] => []);
const rerenders = vi.hoisted((): string[] => []);
const contexts = vi.hoisted(() => ({ opened: 0, failing: new Set<string>() }));
vi.mock("vitest-plugin-rsc/nextjs/testing-library", () => ({
  newBrowserContext: async () => void contexts.opened++,
  cleanup: async () => {},
  renderServer: async (...args: [object, { url?: string }?]) => {
    const node = args.length === 2;
    const { url } = (node ? args[1] : args[0]) as { url?: string };
    requests.push({ url, node });
    if (url && contexts.failing.has(url)) throw new Error(`No page at ${url}`);
    return {
      errors: [],
      ...(node && { rerender: async () => void rerenders.push(url ?? "/") }),
    };
  },
}));

type Options = Parameters<typeof renderToCanvas>[0];
type Context = Options["storyContext"];

const Card = () => null;
const storyOf = (id: string, parameters: object, component?: unknown) => ({
  id,
  viewMode: "story",
  abortSignal: new AbortController().signal,
  component,
  // Without a component, the story is a page.
  originalStoryFn: render,
  parameters: { fileName: "./card.stories.tsx", ...parameters },
  args: {},
  globals: {},
});

const renderWith = (context: object) =>
  renderToCanvas(
    {
      storyContext: context as Context,
      storyFn: () => null,
      showMain: () => {},
      forceRemount: false,
    } as unknown as Options,
    {} as HTMLElement,
  );

test("a page at a URL of its args, loaded anew for new args", async () => {
  const context = storyOf("pages--step", {
    nextjs: { url: ({ args }: { args: { step: string } }) => `/session/${args.step}` },
  });
  requests.splice(0);

  await renderWith({ ...context, args: { step: "1.0" } });
  await renderWith({ ...context, args: { step: "2.0" } });
  expect(requests).toEqual([
    { url: "/session/1.0", node: false },
    { url: "/session/2.0", node: false },
  ]);
});

test("a component renders again in place at its URL, and opens anew at a new one", async () => {
  const context = storyOf(
    "card--step",
    {
      nextjs: {
        layouts: true,
        url: ({ args, globals }: { args: { step: string }; globals: { locale: string } }) =>
          `/${globals.locale}/session/${args.step}`,
      },
    },
    Card,
  );
  requests.splice(0);
  rerenders.splice(0);

  await renderWith({ ...context, args: { step: "1.0", label: "A" }, globals: { locale: "en" } });
  await renderWith({ ...context, args: { step: "1.0", label: "B" }, globals: { locale: "en" } });
  expect(requests).toEqual([{ url: "/en/session/1.0", node: true }]);
  expect(rerenders).toEqual(["/en/session/1.0"]);

  await renderWith({ ...context, args: { step: "2.0", label: "B" }, globals: { locale: "en" } });
  await renderWith({ ...context, args: { step: "2.0", label: "B" }, globals: { locale: "nl" } });
  expect(requests.map(({ url }) => url)).toEqual([
    "/en/session/1.0",
    "/en/session/2.0",
    "/nl/session/2.0",
  ]);
  expect(rerenders).toHaveLength(1);
});

test("a page whose URL is empty has none", async () => {
  const context = storyOf("pages--empty", { nextjs: { url: () => "" } });
  await expect(renderWith(context)).rejects.toThrow(
    "so it is a page of the app, which needs a URL",
  );
});

test("a new URL opens its page in the story's browser context", async () => {
  const context = storyOf(
    "card--context",
    { nextjs: { url: ({ args }: { args: { step: string } }) => `/context/${args.step}` } },
    Card,
  );
  const opened = contexts.opened;
  const show = async (args: object) => {
    await beforeEach({ ...context, args } as unknown as Context);
    await renderWith({ ...context, args });
  };

  await show({ step: "1.0" });
  await show({ step: "2.0" });
  expect(contexts.opened).toBe(opened + 1);
});

test("after a page that failed to open, the URL before it opens anew", async () => {
  const context = storyOf(
    "card--failed",
    { nextjs: { url: ({ args }: { args: { step: string } }) => `/failed/${args.step}` } },
    Card,
  );
  contexts.failing.add("/failed/2.0");
  requests.splice(0);
  rerenders.splice(0);

  await renderWith({ ...context, args: { step: "1.0" } });
  await expect(renderWith({ ...context, args: { step: "2.0" } })).rejects.toThrow(
    "No page at /failed/2.0",
  );
  await renderWith({ ...context, args: { step: "1.0" } });
  expect(requests.map(({ url }) => url)).toEqual(["/failed/1.0", "/failed/2.0", "/failed/1.0"]);
  expect(rerenders).toEqual([]);
});
