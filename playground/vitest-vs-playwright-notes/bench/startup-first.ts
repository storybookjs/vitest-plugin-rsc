// The first setup file of vitest.bench.config.ts, after the plugin's own:
// when the page got here, for the startup table of bench/reporter.ts. Once a
// run: the setup files run again for every test file.

const startup = globalThis as { __benchStartup__?: [label: string, epoch: number][] };
const epoch = () => performance.timeOrigin + performance.now();

if (!startup.__benchStartup__) {
  const marks: [string, number][] = [["page: time origin of the tester", performance.timeOrigin]];
  // The orchestrator, Vitest's page that holds the tester's iframe.
  try {
    if (window.parent !== window) {
      marks.push(["page: time origin of the orchestrator", window.parent.performance.timeOrigin]);
    }
  } catch {}
  // The first module the tester fetched, and the plugin's setup file.
  const resources = performance.getEntriesByType("resource");
  const first = resources[0];
  if (first)
    marks.push(["page: first resource requested", performance.timeOrigin + first.startTime]);
  const pluginSetup = resources.find((entry) => /vitest-plugin-rsc\/.*setup/.test(entry.name));
  if (pluginSetup) {
    marks.push([
      "page: plugin setup file requested",
      performance.timeOrigin + pluginSetup.startTime,
    ]);
  }
  marks.push(["page: plugin setup file done (Next's server layers loaded)", epoch()]);
  startup.__benchStartup__ = marks;
}
