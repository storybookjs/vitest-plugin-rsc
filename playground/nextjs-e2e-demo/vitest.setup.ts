import { vi } from "vitest";
import type { NextBuild } from "vitest-plugin-rsc/nextjs/plugin";
// A file with `"use client"`: the browser layer loads it before this file's
// own code runs, once for the tab. See the file.
import "./test/setup-locale.tsx";

declare module "vitest" {
  interface ProvidedContext {
    // The `build` option of the plugin: see vitest.config.ts.
    build: NextBuild;
    // The version of the React that Next comes with.
    nextReact: string;
  }
}

// With `isolate: false` the test files of a worker share their modules, so a
// mock is for all of them: it goes here, not in a test file.
//
// Needs patches/@vitest__browser@*.patch: Vitest 5.0 imports a test file
// without waiting for this mock.
vi.mock("./app/lib/weather.ts");
