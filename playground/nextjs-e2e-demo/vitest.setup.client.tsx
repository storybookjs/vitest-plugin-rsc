"use client";

import { cleanup as cleanupTestingLibrary } from "@testing-library/react";
import { beforeEach } from "vitest";
import { cleanup } from "vitest-browser-react";

// A setup file with `"use client"`: code of the browser layer, like a test
// file with the directive. Vitest runs it before every test file, as it does
// any setup file, so the hooks it registers are every file's.
//
// A library that renders a component as React does keeps the roots it made.
// vitest-browser-react unmounts them in a `beforeEach()` it registers when
// it loads, and the browser layer loads it once, for the first test file of
// the tab. So before every test, as in Vitest without Next with `isolate:
// false`: see app/client-cleanup.test.tsx.
beforeEach(async () => {
  await cleanup();
  cleanupTestingLibrary();
});
