import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, vi } from "vitest";
import { codeKey, projectKey } from "./optimizer-cache-key.ts";
import { vitestPluginNext } from "./plugin.ts";

// The test loads a Next project: longer than Vitest's 5 s on a loaded CI.
vi.setConfig({ testTimeout: 60_000 });

// What the project gives the optimizer's plugins of the rsc layer.
function projectOf(
  aliases: Record<string, string | false>,
  appAliases: Record<string, string> = {},
  compileOptions: unknown = { jsc: { transform: {} } },
  newExports: Record<string, { name: string; module: string }[]> = {},
) {
  const empty = { rsc: {}, ssr: {}, browser: {} };
  return {
    aliases: { ...empty, rsc: aliases },
    appAliases: { ...empty, rsc: appAliases },
    dependencyCompileOptions: { ...empty, rsc: compileOptions },
    newExports,
    version: "16.4.0",
  };
}

test("keys a layer by its alias tables, in their order, and the options of Next's transform", () => {
  const next = { react$: "next/dist/compiled/react", "next/link$": "next/dist/client/link" };
  const app = { "react-dom/server$": "next/dist/compiled/react-dom/server.node.js" };
  const key = projectKey(projectOf(next, app), "rsc");
  expect(projectKey(projectOf({ ...next }, { ...app }), "rsc")).toBe(key);
  // Another layer's tables are not this one's.
  expect(
    projectKey(
      { ...projectOf(next, app), aliases: { rsc: next, ssr: {}, browser: { a$: "b" } } },
      "rsc",
    ),
  ).toBe(key);

  // A target that changes, one that is no more, and an entry more.
  const changed = { ...next, react$: "next/dist/compiled/react-experimental" };
  expect(projectKey(projectOf(changed, app), "rsc")).not.toBe(key);
  expect(projectKey(projectOf({ ...next, react$: false }, app), "rsc")).not.toBe(key);
  expect(projectKey(projectOf({ ...next, "styled-jsx$": "styled-jsx" }, app), "rsc")).not.toBe(key);
  // An entry of the app's table alone.
  const appOnly = { ...app, "react-dom/static$": "next/dist/compiled/react-dom/static.node.js" };
  expect(projectKey(projectOf(next, appOnly), "rsc")).not.toBe(key);
  // An entry of Next's table that moves to the app's.
  const { "next/link$": link, ...rest } = next;
  expect(projectKey(projectOf(rest, { ...app, "next/link$": link }), "rsc")).not.toBe(key);
  // The same entries in another order: the first that matches wins, so a
  // prefix before an exact entry resolves otherwise.
  const prefixFirst = { next: "next/dist/esm", "next/link$": "next/dist/client/link" };
  const exactFirst = { "next/link$": "next/dist/client/link", next: "next/dist/esm" };
  expect(projectKey(projectOf(prefixFirst), "rsc")).not.toBe(
    projectKey(projectOf(exactFirst), "rsc"),
  );
  // `compiler` of `next.config`, which a package that calls `next/font` is
  // compiled with.
  const removeConsole = { jsc: { transform: {} }, removeConsole: true };
  expect(projectKey(projectOf(next, app, removeConsole), "rsc")).not.toBe(key);
  // An export of Next that a stand-in gets a stub for.
  const newExports = { "gzip-size": [{ name: "stream", module: "next/dist/compiled/gzip-size" }] };
  expect(projectKey(projectOf(next, app, undefined, newExports), "rsc")).not.toBe(key);
});

test("keys the plugin's code by the contents of its files, not their times or tests", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vitest-plugin-rsc-code-"));
  try {
    fs.mkdirSync(path.join(dir, "nextjs"));
    fs.writeFileSync(path.join(dir, "nextjs/server-code.ts"), "export const a = 1;\n");
    fs.writeFileSync(path.join(dir, "async-local-storage-transform.ts"), "export {};\n");
    const key = codeKey(dir);
    expect(codeKey(dir)).toBe(key);

    // A build that writes the same file again.
    const later = new Date(Date.now() + 60_000);
    fs.utimesSync(path.join(dir, "nextjs/server-code.ts"), later, later);
    expect(codeKey(dir)).toBe(key);
    // Tests and types are no part of the code.
    fs.writeFileSync(path.join(dir, "nextjs/server-code.test.ts"), "test();\n");
    fs.writeFileSync(path.join(dir, "index.d.ts"), "export {};\n");
    expect(codeKey(dir)).toBe(key);

    // A change of the compile, in the source or in a chunk of the build.
    fs.writeFileSync(path.join(dir, "nextjs/server-code.ts"), "export const a = 2;\n");
    const changed = codeKey(dir);
    expect(changed).not.toBe(key);
    fs.writeFileSync(path.join(dir, "chunk-1a2b3c.js"), "export {};\n");
    expect(codeKey(dir)).not.toBe(changed);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

type ConfigHook<T> = (config: object, env: { command: "serve" | "build" }) => Promise<T>;
type Define = Record<string, string>;
type Config = {
  environments: Record<
    string,
    { optimizeDeps: { rolldownOptions: { transform: { define: Define } } } }
  >;
};

// The keys of each layer, from a new plugin, which loads the project.
async function keysOfLayers(root: string) {
  const plugin = vitestPluginNext().find(({ name }) => name === "vitest-plugin-rsc:next")!;
  const { environments } = await (plugin.config as ConfigHook<Config>)(
    { root },
    { command: "serve" },
  );
  return ["client", "next_ssr", "react_client"].map((name) => {
    const define = environments[name]!.optimizeDeps.rolldownOptions.transform.define;
    return {
      code: define.__vitest_plugin_rsc_code__,
      project: define.__vitest_plugin_rsc_project__,
    };
  });
}

test("puts both keys in the options of every layer's optimizer, the same for every load", async () => {
  const root = fileURLToPath(new URL("../../../../playground/nextjs-e2e-demo", import.meta.url));
  const keys = await keysOfLayers(root);
  // The code of the package, which here runs from `src`.
  expect(keys[0]!.code).toMatch(/^"[0-9a-f]{16}"$/);
  expect(new Set(keys.map(({ code }) => code)).size).toBe(1);
  // Each layer has tables of its own.
  for (const { project } of keys) expect(project).toMatch(/^"[0-9a-f]{16}"$/);
  expect(new Set(keys.map(({ project }) => project)).size).toBe(3);
  // A second load of the project, as the next run has: the pre-bundles stay.
  expect(await keysOfLayers(root)).toEqual(keys);
});
