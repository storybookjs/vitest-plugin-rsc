import { vi } from "vitest";

// With `isolate: false` the test files of a tab share their modules, so a
// mock is for all of them: it goes here, not in a test file.
vi.mock("./app/lib/weather.ts");
