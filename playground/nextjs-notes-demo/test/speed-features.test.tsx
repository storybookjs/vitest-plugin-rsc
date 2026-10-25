import { expect, inject, onTestFinished, test, vi } from "vitest";
import { page } from "vitest/browser";
import { verifyPassword } from "better-auth/crypto";
import type { NextBuild, SpeedOptions } from "vitest-plugin-rsc/nextjs/plugin";
import { handleRequest, renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { fileChanged } from "../../test-helpers/file-changed.ts";

// What each speed feature gives up, a test per claim of the table of
// docs/fast-tests.md, "The two modes": each asserts what a test sees with the
// speed features that are on in its project. nextjs-notes-demo-browser runs
// the file with none but `watchDom`, nextjs-notes-demo-fast with all, and a
// project per feature in fast mode without that one (vitest.config.ts).

declare module "vitest" {
  interface ProvidedContext {
    // The `build` option of the plugin: see vitest.config.ts.
    build: NextBuild;
  }
}

type Registry = {
  speedFeatures: Required<SpeedOptions>;
  requestTimings?: { kind: string; url: string }[];
};
const registry = (globalThis as { __vitest_plugin_rsc_next__?: Registry })
  .__vitest_plugin_rsc_next__!;
const on = (feature: keyof SpeedOptions) => registry.speedFeatures[feature];
const build = inject("build");

// A page of the kept app renders on the client, without the server's HTML.
const keptApp = on("keepApp");
// `flightLoads` changes nothing without `keepApp`.
const flightLoads = keptApp && on("flightLoads");

// The errors that a test expects, which the setup file or Vitest would fail
// it for: silenced until `callback` is done. With a listener of its own for
// an error of the window, Vitest logs one with `console.error()`.
async function expectingErrors<T>(callback: () => Promise<T>): Promise<T> {
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  const reportError = vi.spyOn(window, "reportError").mockImplementation(() => {});
  const uncaught = () => {};
  window.addEventListener("error", uncaught);
  try {
    return await callback();
  } finally {
    window.removeEventListener("error", uncaught);
    consoleError.mockRestore();
    reportError.mockRestore();
  }
}

// The pathnames of the requests of Next's router for Flight, from now on.
function recordFlightRequests(): () => string[] {
  registry.requestTimings = [];
  const timings = registry.requestTimings;
  onTestFinished(() => {
    registry.requestTimings = undefined;
  });
  return () => timings.filter((t) => t.kind === "flight").map((t) => new URL(t.url).pathname);
}

// Whether the pages from now on render in the app of the page before: Next's
// client sets `window.next` as it starts, which takes the mark off. A kept
// app starts anew too once the dev server has changed a module of the
// browser layer, which the first pages of a run can do, as Vite compiles
// them: the tests take the app as it is.
function markApp(): () => boolean {
  const next = (window as { next?: { keptApp?: boolean } }).next!;
  next.keptApp = true;
  return () => (window as { next?: { keptApp?: boolean } }).next?.keptApp === true;
}

// The evaluation of the module of the probe that renders the page.
const probeModule = async () => {
  await renderServer({ url: "/speed-features" });
  return (await page.getByText(/^Module \d/).findElement()).textContent;
};

test("keepApp: the modules of the page before stay, with their state", async () => {
  const first = await probeModule();
  const sameApp = markApp();
  const second = await probeModule();

  // A page load evaluates the modules of the app again.
  if (!keptApp) expect(sameApp()).toBe(false);
  expect(second === first).toBe(sameApp());
});

test("keepApp: no hydration mismatch, as the page renders on the client", async () => {
  const reported = await expectingErrors(async () => {
    const reportError = vi.mocked(window.reportError);
    await renderServer({ url: "/speed-features?mismatch" });
    // React renders it in the browser again once it is reported.
    await expect.element(page.getByText("Rendered on the browser")).toBeVisible();
    return reportError.mock.calls.map(([error]) => String(error));
  });

  if (keptApp) expect(reported).toEqual([]);
  else {
    expect(reported).toEqual([
      expect.stringMatching(
        build === "development" ? "Hydration failed" : "Minified React error #418",
      ),
    ]);
  }
});

test("keepApp: no preloads of the server's HTML, and flightLoads: Flight's response", async () => {
  await renderServer({ url: "/auth/sign-in" });
  const { response } = await renderServer({ url: "/speed-features" });

  // The fonts of next/font, which the server's HTML preloads, and its `Link`
  // header says.
  const fontPreloads = document.head.querySelectorAll('link[rel="preload"][as="font"]');
  expect(fontPreloads.length > 0).toBe(!keptApp);
  expect(response.headers.has("link")).toBe(!keptApp);
  expect(response.headers.get("content-type")).toMatch(
    flightLoads ? "text/x-component" : "text/html",
  );
  // In no mode: the plugin tells Next that no font of the app adjusts the
  // size of its fallback (build-output.ts).
  expect(document.head.querySelector('meta[name="next-size-adjust"]')).toBeNull();
});

// The status of a page is the server's while it renders the HTML, which a
// page of the kept app has none of: the page reads it from the error in the
// payload, see page-status.test.tsx.
test("every mode: the 404 of a page that is not found", async () => {
  const { response } = await expectingErrors(async () => {
    const rendered = await renderServer({ url: "/notes/not-a-guid" });
    await expect.element(page.getByText("This page could not be found.")).toBeVisible();
    return rendered;
  });

  expect(response.status).toBe(404);
});

test("every mode: the 500 of a page that fails to render", async () => {
  const { response, errors } = await expectingErrors(async () => {
    const rendered = await renderServer({ url: "/speed-features?fail" });
    await expect.poll(() => rendered.errors).not.toEqual([]);
    return rendered;
  });

  expect(response.status).toBe(500);
  // The test hears of the error in either.
  expect(errors).not.toEqual([]);
});

test("every mode: a page that redirects opens its target", async () => {
  // Signed out: the page sends the browser to sign in.
  const { response } = await renderServer({ url: "/notes/new" });

  // As a browser follows the 307 of the document.
  expect(response.redirected).toBe(true);
  expect(new URL(response.url).pathname).toBe("/auth/sign-in");
  expect(window.location.pathname).toBe("/auth/sign-in");
  await expect.element(page.getByLabelText("Email")).toBeInTheDocument();
});

test("every mode: the cookies that a page load sets", async () => {
  // The proxy deletes a flash cookie for a GET of a page: see proxy.ts.
  document.cookie = "__flash:speed-features=1; path=/";

  const { response } = await renderServer({ url: "/auth/sign-in" });

  expect(response.headers.get("set-cookie")).toMatch(/^__flash:speed-features=;/);
  expect(document.cookie).toBe("");
});

test("skipPrefetch: the requests of prefetches, which Next makes in production only", async () => {
  const flightRequests = recordFlightRequests();
  await renderServer({ url: "/auth/sign-in" });

  if (build === "production" && !on("skipPrefetch")) {
    // The links in view: the header's and the form's.
    await expect.poll(flightRequests).toContain("/auth/sign-up");
    return;
  }
  await page.getByRole("main").getByRole("link", { name: "Sign up" }).click();
  await expect.element(page.getByRole("heading", { name: /^Welcome to/ })).toBeVisible();
  // Only the navigation's.
  expect(flightRequests()).toEqual(["/auth/sign-up"]);
});

test("fastCrypto: a password hash of the real algorithm, like one in a fixture", async () => {
  // Better Auth's scrypt hash of the password, made outside a test.
  const hash =
    "57b5280dcf7382cb466c3694b4b75443:1487e66bad0cc069155c9a75eca4e3f5" +
    "faa5c71fe1a365ee5a9d223e31eb264fd65de871aa9909b28fc2095f47ed56a9e0b6" +
    "3d11c5d15b8a33d57db21957b0f6";

  const verified = await verifyPassword({ hash, password: "correct horse battery staple" });

  expect(verified).toBe(!on("fastCrypto"));
});

test("immediates: the delay of a browser for a timeout of 0, five deep", async () => {
  // 30 timeouts of 0 of the server's code, each started by the one before:
  // a browser waits at least 4 ms for each from the sixth on.
  const response = await handleRequest("/api/nested-timeouts");
  const { ms } = (await response.json()) as { ms: number };

  if (on("immediates")) expect(ms).toBeLessThan(80);
  else expect(ms).toBeGreaterThanOrEqual(80);
});

test("cacheDevServer: a change through another connection is seen once its news came", async () => {
  const file = "components/speed-features-label.ts";
  onTestFinished(() => fileChanged(file));
  // Without the server's HTML: the ssr layer renders the Client Component as
  // it was, and the page would hydrate that with the module of now.
  const open = () => renderServer({ url: "/speed-features", ssr: false });
  await open();

  // A request of the test, which is not the page's connection to the dev
  // server.
  await fileChanged(file, 'export const label = "Changed";');

  if (!on("cacheDevServer")) {
    // A page load asks the dev server, after the change.
    await open();
    await expect.element(page.getByText("Label: Changed")).toBeVisible();
    return;
  }
  // The page takes the server's news, which can come after the next load.
  await expect
    .poll(async () => {
      await open();
      return document.body.textContent;
    })
    .toContain("Label: Changed");
});

test("watchDom: nothing, as it sees what a script sets on a property too", async () => {
  await renderServer({ url: "/auth/sign-in" });
  const email = page.getByLabelText("Email");
  const input = (await email.findElement()) as HTMLInputElement;

  // No mutation of the DOM and no event: looked at again after 5 ms.
  setTimeout(() => {
    input.value = "ada@example.com";
  }, 20);

  await expect.element(email).toHaveValue("ada@example.com");
});
