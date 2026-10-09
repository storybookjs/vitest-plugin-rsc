import { instrument } from "storybook/internal/instrumenter";
import { screen, within } from "storybook/test";

// What the framework does at runtime with the parts of Storybook that are not
// its public API, all in this file, each with the API that would replace it.

/**
 * `screen` of Testing Library queries the `<body>` that the document had when
 * `storybook/test` loaded. The plugin gives a page of the app a `<body>` of
 * its own, as a browser does, and so does a node, which keeps the canvas in
 * it: see `loadDocument()` of vitest-plugin-rsc. So `screen` follows the
 * body, for what a story renders in a portal, or for a page, which is the
 * document.
 *
 * There is no API to rebind `screen`: this replaces its queries with ones of
 * the new body, instrumented as `storybook/test` instruments its own, so the
 * Interactions panel logs them as calls of `screen`. Not with the
 * instrumented `within`, whose call the panel would log each time the body
 * changes, also in the middle of a play function. A `screen` of
 * `storybook/test` that queries `document.body` when it is called would
 * replace this.
 */
export function screenFollowsTheBody(): void {
  type Within = typeof within;
  const queriesOf = (within as Within & { __originalFn__?: Within }).__originalFn__ ?? within;
  const follow = () => {
    const { screen: queries } = instrument(
      { screen: queriesOf(document.body) },
      { intercept: (method) => method.startsWith("find") || method.startsWith("waitFor") },
    );
    Object.assign(screen, queries);
  };
  new MutationObserver(follow).observe(document.documentElement, { childList: true });
}

/**
 * In `storybook dev` the preview fetches its story index again when a story
 * file changes, by a URL relative to the document: `./index.json`. While a
 * story is on the canvas, the document is at the URL of its page, like
 * `/notes/7`, where that is `/notes/index.json`, which is not there. So the
 * preview fetches the index from where it loaded: `previewPath`.
 *
 * Storybook's `getStoryIndexFromServer()` is no public API: this replaces it
 * on the preview. A preview that resolves `index.json` against the URL it
 * loaded at, not the document's URL of the moment, would replace this.
 */
export function storyIndexFromThePreview(previewPath: string): void {
  type Preview = { getStoryIndexFromServer?: () => Promise<unknown> };
  const preview = (globalThis as { __STORYBOOK_PREVIEW__?: Preview }).__STORYBOOK_PREVIEW__;
  if (!preview?.getStoryIndexFromServer) return;
  const url = new URL("index.json", new URL(previewPath, window.location.origin)).href;
  preview.getStoryIndexFromServer = async () => {
    const response = await fetchOfThePreview(url);
    if (response.status === 200) return response.json() as Promise<unknown>;
    throw new Error(
      `Storybook could not fetch its story index at ${url}: ${await response.text()}`,
    );
  };
}
// The preview's own `fetch`, as Storybook takes it: not one that a story
// replaces with a spy or a mock.
const fetchOfThePreview = globalThis.fetch.bind(globalThis);

/**
 * A page story owns the document, so its play function looks in the page:
 * this sets the canvas of the context it gets. Storybook passes the context
 * that `renderToCanvas()` has to the play function, but has no API for a
 * renderer to say where a story rendered. A `canvasElement` that
 * `renderToCanvas()` answers with would replace this.
 */
export function canvasIsThePage(context: object): void {
  Object.assign(context, { canvasElement: document.body, canvas: within(document.body) });
}

/**
 * The tags whose stories a docs page leaves out, from the tags options of
 * `.storybook/main.ts`. `@storybook/addon-docs/preview` reads them from this
 * global for its own `docs.stories.filter`, which the framework's stand-in for
 * it has too. A filter that addon-docs exports would replace this.
 */
export function tagsExcludedFromDocs(): Set<string> {
  const options = (
    globalThis as { TAGS_OPTIONS?: Record<string, { excludeFromDocsStories?: boolean }> }
  ).TAGS_OPTIONS;
  return new Set(
    Object.entries(options ?? {}).flatMap(([tag, option]) =>
      option.excludeFromDocsStories ? [tag] : [],
    ),
  );
}
