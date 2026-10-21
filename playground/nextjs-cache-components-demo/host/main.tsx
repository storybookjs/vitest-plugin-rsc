import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";

// A page of Vite that hosts the app without Vitest, for the static build:
// what a test file is to Vitest. Its test opens the build in a browser, see
// build-test/static-build.test.ts.
const state = window as {
  __hostState?: string;
  __hostError?: unknown;
  __hostOpen?: (url: string) => Promise<void>;
};

// Opens a page of the app, the way a test calls `renderServer()`.
state.__hostOpen = async (url) => {
  await renderServer({ url });
};

// What the page shows first is in its query: `?url=/quotes`.
try {
  await state.__hostOpen(new URLSearchParams(window.location.search).get("url") ?? "/");
  state.__hostState = "ready";
} catch (error) {
  state.__hostState = "error";
  state.__hostError = error;
  console.error(error);
}
