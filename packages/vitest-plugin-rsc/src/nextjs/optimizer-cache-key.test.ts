import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, vi } from "vitest";
import { aliasesKey, codeKey } from "./optimizer-cache-key.ts";
import { vitestPluginNext } from "./plugin.ts";

// The test loads a Next project: longer than Vitest's 5 s on a loaded CI.
vi.setConfig({ testTimeout: 60_000 });

test("keys the alias tables of a layer by their entries, in any order", () => {
  const next = { react$: "next/dist/compiled/react", "next/link$": "next/dist/client/link" };
  const app = { "react-dom/server$": "next/dist/compiled/react-dom/server.node.js" };
  const key = aliasesKey(next, app);
  expect(aliasesKey(next, app)).toBe(key);
  // The same entries, added in another order.
  expect(
    aliasesKey({ "next/link$": "next/dist/client/link", react$: "next/dist/compiled/react" }, app),
  ).toBe(key);
  // A target that changes, one that is no more, and an entry more.
  expect(aliasesKey({ ...next, react$: "next/dist/compiled/react-experimental" }, app)).not.toBe(
    key,
  );
  expect(aliasesKey({ ...next, react$: false }, app)).not.toBe(key);
  expect(aliasesKey({ ...next, "styled-jsx$": "styled-jsx" }, app)).not.toBe(key);
  // An entry of Next's table that moves to the app's.
  const { "next/link$": link, ...rest } = next;
  expect(aliasesKey(rest, { ...app, "next/link$": link })).not.toBe(key);
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

test("puts both keys in the options of every layer's optimizer, which Vite hashes", async () => {
  const root = fileURLToPath(new URL("../../../../playground/nextjs-e2e-demo", import.meta.url));
  const plugin = vitestPluginNext().find(({ name }) => name === "vitest-plugin-rsc:next")!;
  const { environments } = await (plugin.config as ConfigHook<Config>)(
    { root },
    { command: "serve" },
  );
  const defines = ["client", "next_ssr", "react_client"].map(
    (name) => environments[name]!.optimizeDeps.rolldownOptions.transform.define,
  );
  const codes = defines.map((define) => define.__vitest_plugin_rsc_code__);
  // The code of the package, which here runs from `src`.
  expect(codes[0]).toMatch(/^"[0-9a-f]{16}"$/);
  expect(new Set(codes).size).toBe(1);
  // Each layer has tables of its own.
  const aliases = defines.map((define) => define.__vitest_plugin_rsc_aliases__);
  for (const key of aliases) expect(key).toMatch(/^"[0-9a-f]{16}"$/);
  expect(new Set(aliases).size).toBe(3);
});
