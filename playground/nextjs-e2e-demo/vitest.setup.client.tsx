"use client";

import { cleanup as cleanupTestingLibrary } from "@testing-library/react";
import { beforeEach } from "vitest";
import { cleanup } from "vitest-browser-react";
// What this file imports loads once for the tab, as a module does: see the
// file, and app/client.test.tsx.
import "./test/setup-locale.tsx";

// A setup file with `"use client"`: code of the browser layer, like a test
// file with the directive. Vitest runs it before every test file, as it does
// any setup file, so the hooks it registers are every file's. The setup of
// the browser layer goes here, as the setup of a client app goes in a Client
// Component of its root layout. A setup file without the directive is server
// code: what it imports with the directive is a reference, as in React.
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
