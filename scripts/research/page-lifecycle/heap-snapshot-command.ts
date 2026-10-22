// A browser command for the measurements: a heap snapshot of the tab, taken
// over CDP from Node.js and streamed to `path`, under the project's root.
// What a `--debug-leaks` mode of the plugin would do after a test file.
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { BrowserCommand } from "vitest/node";

type Context = Parameters<BrowserCommand<[string]>>[0] & {
  page: import("playwright").Page;
};

export const heapSnapshot: BrowserCommand<[file: string]> = async (context, file) => {
  const { page } = context as Context;
  const target = path.resolve(context.project.config.root, file);
  await mkdir(path.dirname(target), { recursive: true });
  const out = createWriteStream(target);
  const session = await page.context().newCDPSession(page);
  session.on("HeapProfiler.addHeapSnapshotChunk", ({ chunk }) => out.write(chunk));
  await session.send("HeapProfiler.enable");
  await session.send("HeapProfiler.collectGarbage");
  await session.send("HeapProfiler.takeHeapSnapshot", { reportProgress: false });
  await new Promise<void>((resolve, reject) =>
    out.end((error?: Error) => (error ? reject(error) : resolve())),
  );
  await session.detach();
  return target;
};

declare module "vitest/browser" {
  interface BrowserCommands {
    heapSnapshot: (file: string) => Promise<string>;
  }
}
