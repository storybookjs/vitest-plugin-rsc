import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createServer } from "vite";
import { expect, onTestFinished, test } from "vitest";
import { changedAfter, onInvalidation, versionOf } from "./module-versions.ts";

// A dev server of a project where `page.ts` imports `badge.ts`, which
// imports `label.ts`, and `note.ts` imports nothing, with the modules of an
// environment that a runner fetched.
async function serve() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "module-versions-")));
  onTestFinished(() => fs.rmSync(root, { recursive: true, force: true }));
  const files = {
    "page.ts": 'export { badge } from "./badge.ts";\n',
    "badge.ts": 'import { label } from "./label.ts";\nexport const badge = label;\n',
    "label.ts": 'export const label = "Label";\n',
    "note.ts": 'export const note = "Note";\n',
  };
  for (const [name, code] of Object.entries(files)) fs.writeFileSync(path.join(root, name), code);
  const server = await createServer({
    root,
    configFile: false,
    logLevel: "silent",
    server: { middlewareMode: true, ws: false, watch: null },
  });
  onTestFinished(() => server.close());
  const environment = server.environments.ssr;
  for (const name of Object.keys(files)) await environment.transformRequest(`/${name}`);
  const { moduleGraph } = environment;
  const id = (name: string) => path.join(root, name);
  return { server, environment, moduleGraph, id };
}

test("is a new version for a change of a file, with the modules that import it", async () => {
  const { moduleGraph, id } = await serve();
  expect(versionOf(moduleGraph)).toBe(0);

  moduleGraph.onFileChange(id("label.ts"));

  const version = versionOf(moduleGraph);
  expect(version).toBeGreaterThan(0);
  expect(changedAfter(moduleGraph, 0).sort()).toEqual(
    [id("badge.ts"), id("label.ts"), id("page.ts")].sort(),
  );
  expect(changedAfter(moduleGraph, version)).toEqual([]);
});

test("says what changed after a version, also for a plugin's invalidation and for HMR", async () => {
  const { environment, moduleGraph, id } = await serve();
  moduleGraph.onFileChange(id("label.ts"));
  const before = versionOf(moduleGraph);

  // A plugin that says a module changed.
  moduleGraph.invalidateModule(moduleGraph.getModuleById(id("note.ts"))!);
  const afterPlugin = versionOf(moduleGraph);
  expect(afterPlugin).toBeGreaterThan(before);
  expect(changedAfter(moduleGraph, before)).toEqual([id("note.ts")]);

  // Vite's HMR of a module, which stamps it and its importers so.
  await environment.reloadModule(moduleGraph.getModuleById(id("badge.ts"))!);
  expect(versionOf(moduleGraph)).toBeGreaterThan(afterPlugin);
  expect(changedAfter(moduleGraph, afterPlugin).sort()).toEqual(
    [id("badge.ts"), id("page.ts")].sort(),
  );
});

test("is 0 for an environment that has no modules", () => {
  expect(versionOf(undefined)).toBe(0);
  expect(changedAfter(undefined, 0)).toEqual([]);
});

test("tells of an invalidation once per environment, after it, whatever made it", async () => {
  const { server, environment, moduleGraph, id } = await serve();
  const heard: [string, number][] = [];
  onInvalidation(server, (name) =>
    heard.push([name, versionOf(server.environments[name]?.moduleGraph)]),
  );

  // As Vitest's watcher does, without a hook of a plugin: the file's modules
  // and their importers.
  moduleGraph.onFileChange(id("label.ts"));
  expect(heard).toEqual([]);
  await Promise.resolve();
  expect(heard).toEqual([["ssr", versionOf(moduleGraph)]]);

  // As the optimizer does, every module of the graph: once.
  moduleGraph.invalidateAll();
  await Promise.resolve();
  // And Vite's HMR.
  await environment.reloadModule(moduleGraph.getModuleById(id("note.ts"))!);
  expect(heard.map(([name]) => name)).toEqual(["ssr", "ssr", "ssr"]);
  expect(heard.at(-1)![1]).toBe(versionOf(moduleGraph));
});
