import { beforeEach } from "vitest";
import { commands } from "vitest/browser";
import "./harness.ts";

// The last setup file of vitest.bench.config.ts, after vitest.setup.ts (the
// database, PGlite): when the app's setup was done and when the first test
// started, sent to bench/reporter.ts with the marks of startup-first.ts.

const startup = globalThis as {
  __benchStartup__?: [label: string, epoch: number][];
  __benchStartupSent__?: boolean;
};
const epoch = () => performance.timeOrigin + performance.now();

if (!startup.__benchStartupSent__) {
  startup.__benchStartup__?.push(["page: app setup files done (PGlite created)", epoch()]);
}

beforeEach(async () => {
  if (startup.__benchStartupSent__) return;
  startup.__benchStartupSent__ = true;
  startup.__benchStartup__?.push(["page: first test starts (plugin's beforeEach done)", epoch()]);
  await commands.benchMarks(JSON.stringify(startup.__benchStartup__ ?? []));
});
