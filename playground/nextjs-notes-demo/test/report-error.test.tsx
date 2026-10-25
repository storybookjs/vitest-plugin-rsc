import { afterEach, beforeEach, describe, expect, onTestFinished, test, vi } from "vitest";
import type { MockInstance } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "#lib/db.ts";
import { signedInAs } from "#test/auth.ts";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";

// An error that no boundary of the app catches, which Next reports with
// `reportError()`, as a browser reports an uncaught error: a test that
// expects one spies on it. The app's error.tsx catches what a page throws, and
// Next logs that instead; what the root layout throws, Next's global error
// catches. In fast mode the pages of a test file render in the app that the
// first one started, whose modules loaded before the spy of a later test.

let reportError: MockInstance<typeof window.reportError>;
beforeEach(() => {
  reportError = vi.spyOn(window, "reportError").mockImplementation(() => {});
  return () => reportError.mockRestore();
});

// What a failed render logs with console.error, which vitest.setup.ts fails a
// test on: Next's report of the error on the server.
const expectFailedRender = () => {
  vi.mocked(console.error).mockImplementation(() => {});
};
afterEach(() => {
  vi.mocked(console.error).mockReset();
});

const loads = [
  { name: "as the mode loads it", ssr: undefined },
  { name: "without HTML of the server", ssr: false },
] as const;

describe.for(loads)("a page loaded $name", ({ ssr }) => {
  test("reports no error when nothing fails", async () => {
    await signedInAs();
    await renderServer({ url: "/notes", ssr });

    expect(reportError).not.toHaveBeenCalled();
  });

  test("reports what a Client Component of the root layout throws", async () => {
    // The theme provider of the root layout asks for the color scheme of the
    // system as it renders.
    const broken = new Error("matchMedia is broken");
    vi.spyOn(window, "matchMedia").mockImplementation(() => {
      throw broken;
    });
    onTestFinished(() => vi.mocked(window.matchMedia).mockRestore());
    expectFailedRender();

    await renderServer({ url: "/", ssr });

    await expect.poll(() => reportError).toHaveBeenCalledWith(broken);
  });

  test("reports what a Server Component of the root layout throws", async () => {
    await signedInAs();
    // The database has lost the table of the sessions, which the root layout
    // reads for its navigation.
    await db.execute(sql`ALTER TABLE session RENAME TO session_gone`);
    onTestFinished(async () => {
      await db.execute(sql`ALTER TABLE session_gone RENAME TO session`);
    });
    expectFailedRender();

    const { response } = await renderServer({ url: "/notes", ssr });

    expect(response.status).toBe(500);
    // React's production build reports an error of the server by its
    // digest only.
    await expect
      .poll(() => reportError)
      .toHaveBeenCalledWith(expect.objectContaining({ digest: expect.any(String) }));
  });
});
