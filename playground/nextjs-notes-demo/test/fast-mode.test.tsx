import { expect, onTestFinished, test, vi } from "vitest";
import { page } from "vitest/browser";
import { signedInAs } from "#test/auth.ts";
import { handleRequest, renderServer } from "vitest-plugin-rsc/nextjs/testing-library";

// What fast mode (`mode: "fast"` of `vitestPluginNext()`) keeps of what a test
// sees, where the pages of a test file render in one app: the project
// nextjs-notes-demo-fast runs the suite in it. These hold with page loads too,
// in fidelity mode, as nextjs-notes-demo-browser runs them. In order: each test
// leans on the page of the one before.

test("types a title into the form", async () => {
  await signedInAs();
  await renderServer({ url: "/notes/new" });

  await page.getByLabelText("Title").fill("Draft");

  await expect.element(page.getByLabelText("Title")).toHaveValue("Draft");
});

test("starts from an empty form, after the test before typed into it", async () => {
  await signedInAs();
  await renderServer({ url: "/notes/new" });

  await expect.element(page.getByLabelText("Title")).toHaveValue("");
});

test("hydrates the HTML of the server with `ssr: true`", async () => {
  await signedInAs();
  const { errors } = await renderServer({ url: "/notes/new", ssr: true });

  await page.getByLabelText("Title").fill("Groceries");
  await page.getByRole("button", { name: "Create note" }).click();

  await expect
    .element(page.getByRole("heading", { level: 1, name: "Groceries" }))
    .toBeInTheDocument();
  expect(errors).toEqual([]);
});

test("renders the page without HTML of the server after a test with it", async () => {
  await signedInAs();
  const { errors } = await renderServer({ url: "/notes/new", ssr: false });

  await page.getByLabelText("Title").fill("Errands");
  await page.getByRole("button", { name: "Create note" }).click();

  await expect
    .element(page.getByRole("heading", { level: 1, name: "Errands" }))
    .toBeInTheDocument();
  expect(errors).toEqual([]);
});

test("loads the page that the app navigates to without its router, after a page without HTML", async () => {
  await signedInAs();
  const { errors } = await renderServer({ url: "/notes" });

  // As a `<form>` without a Server Action or an `<a>` without Next's router would.
  window.location.assign("/profile");

  await expect
    .element(page.getByRole("heading", { level: 1, name: "Profile" }))
    .toBeInTheDocument();
  expect(window.location.pathname).toBe("/profile");
  expect(errors).toEqual([]);
});

test("opens the page that a page redirects to as it renders, with one request of each", async () => {
  // The page loads of the server, as it gets them.
  const registry = (globalThis as { __vitest_plugin_rsc_next__?: { requestTimings?: unknown[] } })
    .__vitest_plugin_rsc_next__!;
  registry.requestTimings = [];
  onTestFinished(() => {
    registry.requestTimings = undefined;
  });

  // Signed out: the page sends the browser to sign in.
  const { errors, response } = await renderServer({ url: "/notes/new" });

  // As a browser has it after the 307 of the document: in fast mode, after
  // the request of Flight of the page that the payload redirects to.
  expect(response.redirected).toBe(true);
  expect(new URL(response.url).pathname).toBe("/auth/sign-in");
  expect(window.location.pathname).toBe("/auth/sign-in");
  await expect.element(page.getByLabelText("Email")).toBeInTheDocument();
  const timings = registry.requestTimings as { kind: string; url: string }[];
  const pageLoads = timings.filter((t) => t.kind === "page").map((t) => new URL(t.url).pathname);
  expect(pageLoads).toEqual(["/notes/new", "/auth/sign-in"]);
  expect(errors).toEqual([]);
});

test("answers a request of the test with the HTML of its page, while a page without it is open", async () => {
  await signedInAs();
  await renderServer({ url: "/notes" });

  const html = await (await handleRequest("/profile")).text();

  expect(html).toContain(">Profile</h1>");
  expect(html).not.toContain("__next_error__");
});

test("removes without an error a `<style>` that the app removes a moment after its page is left", async () => {
  const { unmount } = await renderServer({ url: "/auth/sign-in" });
  // As the theme changes, the theme provider of the app takes the
  // transitions off with a `<style>` in the `<head>`, and removes it a moment
  // later: here only once the page is left.
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  onTestFinished(() => {
    vi.useRealTimers();
  });
  const added = new Promise<Node>((resolve) => {
    const observer = new MutationObserver((records) => {
      const style = records
        .flatMap((record) => Array.from(record.addedNodes))
        .find((node) => node instanceof HTMLStyleElement);
      if (!style) return;
      observer.disconnect();
      resolve(style);
    });
    observer.observe(document.head, { childList: true });
  });
  window.dispatchEvent(new StorageEvent("storage", { key: "theme", newValue: "dark" }));
  const style = await added;

  await unmount();
  vi.advanceTimersByTime(1);

  expect(style.isConnected).toBe(false);
});

test("advances the fake timers of the test between the looks of `expect.element()`", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const status = document.createElement("output");
  status.dataset.testid = "status";
  status.textContent = "Saving";
  document.body.append(status);
  onTestFinished(() => {
    status.remove();
    vi.useRealTimers();
  });
  setTimeout(() => {
    status.textContent = "Saved";
  }, 100);

  await expect.element(page.getByTestId("status")).toHaveTextContent("Saved");
});
