import { mkdir, writeFile } from "node:fs/promises";
import type { BrowserCommand } from "vitest/node";
import { mergeConfig } from "vitest/config";
import config from "./vitest.config.ts";

// vitest.config.ts, with a CPU profile of the page for every test file in
// profiles/, which test/profile-summary.py sums up: see the profile job of
// .github/workflows/vitest-vs-playwright.yml.

type Session = { send(method: string, params?: object): Promise<{ profile?: unknown }> };
let session: Session | undefined;

const startProfile: BrowserCommand<[]> = async ({ page }) => {
  session = (await page.context().newCDPSession(page)) as unknown as Session;
  await session.send("Profiler.enable");
  await session.send("Profiler.setSamplingInterval", { interval: 200 });
  await session.send("Profiler.start");
};

const stopProfile: BrowserCommand<[name: string]> = async (_context, name) => {
  if (!session) return;
  const { profile } = await session.send("Profiler.stop");
  session = undefined;
  await mkdir("profiles", { recursive: true });
  await writeFile(`profiles/${name}.cpuprofile`, JSON.stringify(profile));
};

export default mergeConfig(config, {
  test: {
    browser: { commands: { startProfile, stopProfile } },
    setupFiles: ["./test/profile.ts"],
  },
});
