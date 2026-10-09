import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createLogger, createServer } from "vite";
import { expect, test } from "vitest";
import { vitestPluginRSC } from "../index.ts";
import { vitestPluginNext } from "./plugin.ts";

// What Vite's dependency scan finds in each layer of an app, from a cold
// cache, and the errors it logs. A module that the scan does not resolve fails
// the scan of its layer as a whole: Vite then pre-bundles nothing up front, and
// finds every dependency while the tests run, which reloads their page. It says
// so in one line of the log, and an optimizer with a warm cache does not scan,
// so it goes unnoticed where the tests ran before.
//
// A file of its own: it starts a dev server for two apps, which takes the
// CPU of its worker for a while.
async function scan(appRoot: string) {
  const errors: string[] = [];
  const logger = createLogger("silent");
  logger.error = (message) => void errors.push(message);
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "vitest-plugin-rsc-scan-"));
  const server = await createServer({
    root: appRoot,
    configFile: false,
    cacheDir,
    customLogger: logger,
    resolve: { tsconfigPaths: true },
    server: { middlewareMode: true, ws: false, watch: null },
    plugins: [vitestPluginRSC(), vitestPluginNext()],
  });
  try {
    const found: Record<string, string[]> = {};
    await Promise.all(
      Object.entries(server.environments).map(async ([name, { depsOptimizer }]) => {
        if (!depsOptimizer) return;
        await depsOptimizer.scanProcessing;
        found[name] = Object.keys(depsOptimizer.metadata.discovered);
        // Before it bundles what it found, which the server's close() does
        // not stop: it would go on next to the tests that run after this one.
        await depsOptimizer.close();
      }),
    );
    return { errors, found };
  } finally {
    await server.close();
    fs.rmSync(cacheDir, { recursive: true, force: true });
  }
}

// With a dependency that a file of `app/` imports. The notes demo has a story
// of Storybook next to its routes, which imports a virtual module of the
// Storybook framework.
test.for([
  { app: "nextjs-e2e-demo", dependency: "@t3-oss/env-core" },
  { app: "nextjs-notes-demo", dependency: "zod-form-data" },
])(
  "has Vite scan the files of every layer of $app, from a cold cache",
  { timeout: 60_000 },
  async ({ app, dependency }) => {
    const appRoot = fileURLToPath(new URL(`../../../../playground/${app}`, import.meta.url));
    const { errors, found } = await scan(appRoot);

    expect(errors).toEqual([]);
    expect(new Set(Object.keys(found))).toEqual(new Set(["client", "next_ssr", "react_client"]));
    for (const dependencies of Object.values(found)) expect(dependencies).toContain(dependency);
  },
);
