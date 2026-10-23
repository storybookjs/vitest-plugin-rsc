import { afterAll, beforeAll } from "vitest";
import { commands } from "vitest/browser";

// The CPU profile of a test file, of vitest.profile.config.ts, or its trace
// of Chrome with `VITEST_PROFILE=trace`.

declare module "vitest/browser" {
  interface BrowserCommands {
    startProfile(): Promise<void>;
    stopProfile(name: string): Promise<void>;
    startTrace(): Promise<void>;
    stopTrace(name: string): Promise<void>;
  }
}

const tracing = import.meta.env.VITEST_PROFILE === "trace";
let name = "";
// oxlint-disable-next-line no-empty-pattern
beforeAll(async ({}, suite) => {
  name = suite.file.name.replace(/\W+/g, "-");
  await (tracing ? commands.startTrace() : commands.startProfile());
});
afterAll(() => (tracing ? commands.stopTrace(name) : commands.stopProfile(name)));
