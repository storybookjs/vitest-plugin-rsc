import { afterAll, beforeAll } from "vitest";
import { commands } from "vitest/browser";

// The CPU profile of a test file, of vitest.profile.config.ts.

declare module "vitest/browser" {
  interface BrowserCommands {
    startProfile(): Promise<void>;
    stopProfile(name: string): Promise<void>;
  }
}

let name = "";
// oxlint-disable-next-line no-empty-pattern
beforeAll(async ({}, suite) => {
  name = suite.file.name.replace(/\W+/g, "-");
  await commands.startProfile();
});
afterAll(() => commands.stopProfile(name));
