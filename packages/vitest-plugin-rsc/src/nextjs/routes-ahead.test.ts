import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ViteDevServer } from "vite";
import { expect, onTestFinished, test } from "vitest";
import { answerOf } from "../page-bridge.ts";
import { routesAheadEvent, type RoutesAheadNews } from "./routes-ahead-shared.ts";
import { routesAheadPlugin } from "./routes-ahead.ts";

// A run of Vitest with the plugin, as far as the routes ahead go: a dev
// server that the pages of the run tell of their test files and routes, and
// the routes it compiled.
function run(root: string) {
  const compiled: string[] = [];
  const vite = { config: { logger: { error() {} } } } as unknown as ViteDevServer;
  const plugin = routesAheadPlugin({
    root: () => root,
    compile: async (_vite, entry) => void compiled.push(entry),
  });
  (plugin.configureServer as (server: ViteDevServer) => void)(vite);
  const page = async (news: RoutesAheadNews) => {
    await answerOf(vite, routesAheadEvent, news);
  };
  return { compiled, page };
}

function project() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vitest-plugin-rsc-routes-ahead-"));
  onTestFinished(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

test("compiles the routes a test file opened in the run before, in the order it opened them", async () => {
  const root = project();
  const testFile = path.join(root, "app/notes.test.tsx");

  const first = run(root);
  await first.page({ testFile });
  await first.page({ testFile, opened: "/notes/page" });
  await first.page({ testFile, opened: "/notes/[id]/page" });
  await first.page({ testFile, opened: "/notes/page" });
  // A file that runs for the first time compiles nothing ahead.
  expect(first.compiled).toEqual([]);

  const second = run(root);
  await second.page({ testFile });
  expect(second.compiled).toEqual(["/notes/page", "/notes/[id]/page"]);
  // Another test file has routes of its own.
  await second.page({ testFile: path.join(root, "app/other.test.tsx") });
  expect(second.compiled).toEqual(["/notes/page", "/notes/[id]/page"]);
});

test("keeps the routes the test file opens in this run, not a route it no longer opens", async () => {
  const root = project();
  const testFile = path.join(root, "app/notes.test.tsx");

  const first = run(root);
  await first.page({ testFile });
  await first.page({ testFile, opened: "/notes/page" });
  await first.page({ testFile, opened: "/old/page" });

  const second = run(root);
  await second.page({ testFile });
  await second.page({ testFile, opened: "/notes/page" });

  const third = run(root);
  await third.page({ testFile });
  expect(third.compiled).toEqual(["/notes/page"]);
});
