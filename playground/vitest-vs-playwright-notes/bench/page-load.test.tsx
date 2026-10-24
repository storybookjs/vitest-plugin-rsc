import { test } from "vitest";
import { newBrowserContext, renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { hasHeading, seedApp, signIn } from "./app.ts";
import { measure, untilDom } from "./harness.ts";

// A page load as a test starts with one: a browser context of its own, as the
// plugin's `beforeEach` opens (not timed), then `renderServer({ url })`, until
// it resolved and the heading is in the DOM. `server` is the union of the
// requests of the page from queued to finished, `client` the rest;
// `heading in DOM` is when a MutationObserver first saw the heading,
// `hydrated` when `renderServer()` resolved.

const pages = [
  { label: "/notes", url: () => "/notes", heading: () => "Notes" },
  { label: "/notes/[id]", url: (id: number) => `/notes/${id}`, heading: () => "Note 01" },
  { label: "/notes/new", url: () => "/notes/new", heading: () => "New note" },
];

for (const ssr of [true, false]) {
  for (const { label, url, heading } of pages) {
    test(`page load ${label}, ssr: ${ssr}`, async () => {
      const { token, notes } = await seedApp();
      const href = url(notes[0]!.id);
      await measure(
        `Page load › ${label}, ssr: ${ssr}`,
        async ({ start }) => {
          const seen = untilDom(() => hasHeading(heading()));
          await renderServer({ url: href, ssr });
          const hydrated = performance.now();
          const headingAt = await seen;
          return { "heading in DOM": headingAt - start, hydrated: hydrated - start };
        },
        {
          split: true,
          before: async () => {
            await newBrowserContext();
            signIn(token);
            if (hasHeading(heading())) throw new Error("The page before is still there");
          },
        },
      );
    });
  }
}

test("test boundary", async () => {
  const { token } = await seedApp();
  await measure("Test boundary › newBrowserContext() after /notes", () => newBrowserContext(), {
    before: async () => {
      signIn(token);
      await renderServer({ url: "/notes" });
    },
    note: "what the plugin's beforeEach/afterEach do between tests, without linking stylesheets",
  });
});
