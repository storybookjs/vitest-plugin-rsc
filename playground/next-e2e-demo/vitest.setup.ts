import { vi } from "vitest";

// With `isolate: false` the test files of a tab share their modules, so a
// mock is for all of them: it goes here, not in a test file.
//
// Needs patches/@vitest__browser@*.patch: Vitest 5.0 imports a test file
// without waiting for this mock.
vi.mock("./app/lib/weather.ts");
