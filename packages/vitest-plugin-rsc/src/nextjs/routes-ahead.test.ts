import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ViteDevServer } from "vite";
import { expect, onTestFinished, test } from "vitest";
import { answerOf } from "../page-bridge.ts";
import {
  modulesAheadEvent,
  routesAheadEvent,
  type ModulesAheadQuestion,
  type RoutesAheadNews,
} from "./routes-ahead-shared.ts";
import { routesAheadPlugin } from "./routes-ahead.ts";

// A run of Vitest with the plugin, as far as the routes ahead go: a dev
// server that the pages of the run tell of their test files and routes, and
// the routes it compiled, and the modules it has the page preload, with the
// version of its pre-bundle.
function run(root: string, browserHash?: string) {
  const compiled: string[] = [];
  const vite = {
    config: { logger: { error() {} } },
    environments: { client: { depsOptimizer: browserHash && { metadata: { browserHash } } } },
  } as unknown as ViteDevServer;
  const plugin = routesAheadPlugin({
    root: () => root,
    compile: async (_vite, entry) => void compiled.push(entry),
    environment: "client",
  });
  (plugin.configureServer as (server: ViteDevServer) => void)(vite);
  const page = async (news: RoutesAheadNews) => {
    await answerOf(vite, routesAheadEvent, news);
  };
  const modules = async (question: ModulesAheadQuestion) =>
    ((await answerOf(vite, modulesAheadEvent, question)) as { result: { answer: unknown } }).result
      .answer;
  return { compiled, page, modules };
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

test("has a tab preload the modules that the first test file of each tab loaded in the run before", async () => {
  const root = project();
  const notes = path.join(root, "app/notes.test.tsx");
  const other = path.join(root, "app/other.test.tsx");

  const first = run(root);
  // Nothing yet.
  expect(await first.modules({})).toEqual([]);
  await first.modules({
    loaded: { testFile: notes, modules: ["/app/layout.tsx", "/app/page.tsx"] },
  });
  await first.modules({ loaded: { testFile: other, modules: ["/app/layout.tsx", "/lib/db.ts"] } });

  const second = run(root);
  expect(await second.modules({})).toEqual(["/app/layout.tsx", "/app/page.tsx", "/lib/db.ts"]);
  // What a file loads now replaces what it loaded before.
  await second.modules({ loaded: { testFile: other, modules: ["/app/layout.tsx"] } });
  expect(await run(root).modules({})).toEqual(["/app/layout.tsx", "/app/page.tsx"]);
});

test("leaves out the pre-bundled modules of another version of the pre-bundle", async () => {
  const root = project();
  const testFile = path.join(root, "app/notes.test.tsx");
  const deps = "/node_modules/.vite/deps";
  const modules = ["/app/page.tsx", `${deps}/next.js?v=aaa`, `${deps}/react.js?v=bbb`];
  await run(root, "aaa").modules({ loaded: { testFile, modules } });
  expect(await run(root, "bbb").modules({})).toEqual(["/app/page.tsx", `${deps}/react.js?v=bbb`]);
});
