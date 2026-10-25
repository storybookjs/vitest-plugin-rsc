import { afterEach, beforeEach, describe, expect, inject, onTestFinished, test, vi } from "vitest";
import { page } from "vitest/browser";
import { sql } from "drizzle-orm";
import { db } from "#lib/db.ts";
import { signedInAs } from "#test/auth.ts";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";

// The status of the document of a page, and the page that a `redirect()` sends
// it to, as the `response` of `renderServer()` has them. Next sets them as it
// renders the HTML of the page. Fast mode renders none: the page renders from
// its Flight payload, which has the error that would have failed that render.
// In each mode, by a document of `ssr: false` too, and in fast mode by a
// document instead of the request of Flight, without `flightLoads`.

const registry = (
  globalThis as { __vitest_plugin_rsc_next__?: { speedFeatures?: Record<string, boolean> } }
).__vitest_plugin_rsc_next__!;

// What a failed render reports with console.error, which vitest.setup.ts
// fails a test on: Next's report of the error, on the server and in the page,
// and React's warning of the script tags of the app in Next's error page of a
// document, which renders on the client.
let failedRender = false;
const expectFailedRender = () => {
  failedRender = true;
  vi.mocked(console.error).mockImplementation(() => {});
};
afterEach(() => {
  if (failedRender) vi.mocked(console.error).mockReset();
  failedRender = false;
});

const loads = [
  { name: "as the mode loads it", ssr: undefined, flightLoads: true },
  { name: "without HTML of the server", ssr: false, flightLoads: true },
  { name: "by its document, without flightLoads", ssr: undefined, flightLoads: false },
] as const;

describe.for(loads)("a page loaded $name", ({ ssr, flightLoads }) => {
  if (inject("mode") === "fast" && !flightLoads) {
    const features = registry.speedFeatures!;
    beforeEach(() => {
      features.flightLoads = false;
      return () => {
        features.flightLoads = true;
      };
    });
  }

  test("that calls notFound() is a 404", async () => {
    await signedInAs();
    expectFailedRender();
    const { response } = await renderServer({ url: "/notes/not-a-note", ssr });

    expect(response.status).toBe(404);
    await expect.element(page.getByText("This page could not be found.")).toBeInTheDocument();
  });

  test("that calls forbidden() is a 403", async () => {
    await signedInAs();
    expectFailedRender();
    const { response } = await renderServer({ url: "/admin", ssr });

    expect(response.status).toBe(403);
    await expect.element(page.getByText("This page could not be accessed.")).toBeInTheDocument();
  });

  test("whose render fails is a 500, with the error page of the app", async () => {
    await signedInAs();
    // The database has lost the table of the notes.
    await db.execute(sql`ALTER TABLE notes RENAME TO notes_gone`);
    onTestFinished(async () => {
      await db.execute(sql`ALTER TABLE notes_gone RENAME TO notes`);
    });
    expectFailedRender();

    const { response } = await renderServer({
      url: "/notes/00000000-0000-4000-8000-000000000001",
      ssr,
    });

    expect(response.status).toBe(500);
    await expect
      .element(page.getByRole("heading", { level: 1, name: "Something went wrong" }))
      .toBeInTheDocument();
  });

  test("that redirects opens the page it redirects to", async () => {
    // Signed out: the page sends the browser to sign in.
    const { response } = await renderServer({ url: "/notes/new", ssr });

    expect(response.status).toBe(200);
    expect(response.redirected).toBe(true);
    expect(new URL(response.url).pathname).toBe("/auth/sign-in");
    expect(window.location.pathname).toBe("/auth/sign-in");
    await expect.element(page.getByLabelText("Email")).toBeInTheDocument();
  });
});
