import { initialize, renderServer } from "vitest-plugin-rsc/testing-library";
import { Greetings } from "./greetings.tsx";

// A page of Vite that renders Server Components without Vitest, for the
// static build: what a test file and its setup file are to Vitest. It runs in
// the rsc layer, so the greetings it seeds are the ones the Server Component
// reads. Its test opens the build in a browser, see
// build-test/static-build.test.ts.
initialize();

const state = window as { __hostState?: string; __hostError?: unknown };
try {
  await renderServer(<Greetings from="the host" />);
  state.__hostState = "ready";
} catch (error) {
  state.__hostState = "error";
  state.__hostError = error;
  console.error(error);
}
