import { handleRequest, renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import {
  afterEach,
  beforeEach,
  expect,
  inject,
  onTestFinished,
  test,
  vi,
  type MockInstance,
} from "vitest";
import { page } from "vitest/browser";
import { Suspense } from "react";
import { BreaksOnClick, BreaksOnServer, ClientReactBuild, Mismatch } from "./components/build.tsx";
import { buildOf } from "./lib/build.ts";

// The `build` option of the plugin. CI runs this file with each: see
// vitest.config.ts.
const build = inject("build");

// An uncaught error, which fails the test it happens in. React's production
// build reports its own errors by their number, and an error of the server by
// its digest only: Next logs the error with the same digest.
let reportError: MockInstance<typeof window.reportError>;
let consoleError: MockInstance<typeof console.error>;

beforeEach(() => {
  vi.restoreAllMocks();
  reportError = vi.spyOn(window, "reportError").mockImplementation(() => {});
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
});

// Not for the test files that run after this one, in the same browser.
afterEach(() => {
  vi.restoreAllMocks();
});

const reported = async () => {
  await expect.poll(() => reportError).toHaveBeenCalledOnce();
  return reportError.mock.calls[0]![0] as Error & { digest?: string };
};

// What Next logged on the server with the digest of an error.
const logged = (digest: string | undefined) => {
  expect(digest).toEqual(expect.any(String));
  return consoleError.mock.calls
    .flat()
    .find((error) => (error as { digest?: string })?.digest === digest);
};

// What the server rendered for a Suspense boundary that failed, which React
// renders again in the browser. The plugin moves the page into the document
// in steps.
function recordFailedBoundaries(): Set<Element> {
  const boundaries = new Set<Element>();
  const observer = new MutationObserver((records) => {
    for (const node of records.flatMap((record) => [...record.addedNodes])) {
      if (!(node instanceof Element)) continue;
      if (node.matches("template[data-dgst]")) boundaries.add(node);
      for (const boundary of node.querySelectorAll("template[data-dgst]")) boundaries.add(boundary);
    }
  });
  observer.observe(document, { childList: true, subtree: true });
  onTestFinished(() => observer.disconnect());
  return boundaries;
}

function ReactBuild() {
  return (
    <section aria-label="React build">
      <p>Server Component: React {buildOf(<i />)}</p>
      <ClientReactBuild element={<i />} />
    </section>
  );
}

test("runs the build of React that the plugin is set to, in every layer", async () => {
  await renderServer(<ReactBuild />);

  await expect
    .element(page.getByRole("region", { name: "React build" }))
    .toHaveTextContent(
      `Server Component: React ${build}` +
        `Server: React ${build}, Flight client ${build}. ` +
        `Browser: React ${build}, React DOM ${build}, Flight client ${build}`,
    );
});

test("runs the code of Next's runtime that the plugin is set to", async () => {
  await renderServer(<p>Next</p>);

  // Next's router puts itself on `window.nd` in development, for debugging.
  expect("nd" in window).toBe(build === "development");
});

test("sends the RSC payload of the build of React that the plugin is set to", async () => {
  const response = await handleRequest("/", { headers: { rsc: "1" } });

  // React's development build sends along who rendered each element.
  expect((await response.text()).includes('"env":"Server"')).toBe(build === "development");
});

test("fails the test on a hydration mismatch", async () => {
  await renderServer(<Mismatch />);

  expect(String(await reported())).toMatch(
    build === "development" ? "Hydration failed" : "Minified React error #418",
  );
});

test("fails the test with what a Server Component throws", async () => {
  function Broken(): never {
    throw new Error("Broken Server Component");
  }

  await renderServer(<Broken />);

  const error = await reported();
  expect(error.message).toMatch(
    build === "development" ? "Broken Server Component" : "Minified React error #441",
  );
  expect(String(logged(error.digest))).toBe("Error: Broken Server Component");
});

test("fails the test with what a Client Component throws on the server", async () => {
  const failed = recordFailedBoundaries();

  await renderServer(
    <Suspense>
      <BreaksOnServer />
    </Suspense>,
  );

  // React renders it again in the browser, where it does not throw.
  await expect.element(page.getByText("Rendered in the browser")).toBeVisible();
  const error = await reported();
  expect(error.message).toMatch(
    build === "development" ? "Broken on the server" : "Minified React error #419",
  );
  expect(String(logged(error.digest))).toBe("Error: Broken on the server");
  // React DOM's development build sends the message along with the HTML.
  expect([...failed].map((boundary) => boundary.hasAttribute("data-msg"))).toEqual([
    build === "development",
  ]);
});

test("fails the test with what a Client Component throws in the browser", async () => {
  await renderServer(<BreaksOnClick />);

  await page.getByRole("button", { name: "Break" }).click();

  expect(String(await reported())).toBe("Error: Broken Client Component");
});
