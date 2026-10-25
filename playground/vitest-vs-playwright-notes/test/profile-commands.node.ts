// The commands of test/profile.ts in a worker of Node.js, with a DOM of
// happy-dom or jsdom (`VITEST_DOM`), where Browser Mode has those of
// vitest.profile.config.ts: the CPU profile of the worker, by Node's
// inspector, where the page and the server share the one thread, and the
// timings, written by the worker itself. No trace, which is Chrome's.

// Not imports, which the page's environment resolves as a browser's.
const { mkdir, writeFile } = process.getBuiltinModule("node:fs/promises");
const { Session } = process.getBuiltinModule("node:inspector/promises");

let session: InstanceType<typeof Session> | undefined;

export const commands = {
  async startProfile(): Promise<void> {
    session = new Session();
    session.connect();
    await session.post("Profiler.enable");
    await session.post("Profiler.setSamplingInterval", { interval: 200 });
    await session.post("Profiler.start");
  },
  async stopProfile(name: string): Promise<void> {
    if (!session) return;
    const { profile } = await session.post("Profiler.stop");
    session.disconnect();
    session = undefined;
    await mkdir("profiles", { recursive: true });
    await writeFile(`profiles/${name}.cpuprofile`, JSON.stringify(profile));
  },
  startTrace(): Promise<void> {
    throw new Error("VITEST_PROFILE=trace is a trace of Chrome: there is none in Node.js.");
  },
  stopTrace(): Promise<void> {
    return Promise.resolve();
  },
  async writeTimings(name: string, timings: string): Promise<void> {
    await mkdir("timings", { recursive: true });
    await writeFile(`timings/${name}.json`, timings);
  },
};
