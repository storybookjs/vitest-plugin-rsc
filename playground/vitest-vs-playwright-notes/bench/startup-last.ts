import { afterEach, beforeEach } from "vitest";
import { commands } from "vitest/browser";
import { requests } from "./harness.ts";

// The last setup file of vitest.bench.config.ts, after vitest.setup.ts (the
// database, PGlite): when the app's setup was done, when the first test
// started, when the server answered its first request, the first page, and
// when the first test ended, sent to bench/reporter.ts with the marks of
// startup-first.ts.

const startup = globalThis as {
  __benchStartup__?: [label: string, epoch: number][];
  __benchStartupSent__?: boolean;
};
const epoch = () => performance.timeOrigin + performance.now();
const at = (time: number) => performance.timeOrigin + time;

if (!startup.__benchStartupSent__) {
  startup.__benchStartup__?.push(["page: app setup files done (PGlite created)", epoch()]);
  // The server records its requests from here on.
  requests();
}

beforeEach(() => {
  if (startup.__benchStartupSent__) return;
  startup.__benchStartup__?.push(["page: first test starts (plugin's beforeEach done)", epoch()]);
});

afterEach(async () => {
  if (startup.__benchStartupSent__) return;
  startup.__benchStartupSent__ = true;
  const marks = startup.__benchStartup__ ?? [];
  marks.push(["page: first test ends", epoch()]);
  const first = requests().find((timing) => timing.kind === "page") ?? requests()[0];
  if (first) {
    const name = `first ${first.kind} request (${new URL(first.url).pathname})`;
    marks.push([`page: ${name} reaches the server`, at(first.queued)]);
    if (first.answered) marks.push([`page: ${name} answered`, at(first.answered)]);
    if (first.finished) marks.push([`page: ${name} finished`, at(first.finished)]);
  }
  await commands.benchMarks(JSON.stringify(marks));
});
