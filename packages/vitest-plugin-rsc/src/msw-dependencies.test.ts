import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ViteDevServer } from "vite";
import { describe, expect, onTestFinished, test } from "vitest";
import { mswDependencies, mswDependenciesPlugin } from "./msw-dependencies.ts";

// A project with an MSW of these files in its `node_modules`.
function projectWithMsw(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "msw-dependencies-"));
  onTestFinished(() => fs.rmSync(root, { recursive: true, force: true }));
  const manifest = {
    name: "msw",
    exports: {
      ".": { import: { types: "./core.d.mts", default: "./lib/core/index.mjs" } },
      "./browser": {
        browser: { default: "./lib/browser/index.mjs" },
        node: null,
        import: { default: "./lib/browser/index.mjs" },
      },
      "./node": { import: { default: "./lib/node/index.mjs" } },
      "./package.json": "./package.json",
    },
    dependencies: { "@mswjs/interceptors": "*", graphql: "*", outvariant: "*", yargs: "*" },
  };
  const all = { "package.json": JSON.stringify(manifest), ...files };
  for (const [name, code] of Object.entries(all)) {
    const file = path.join(root, "node_modules/msw", name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, code);
  }
  fs.writeFileSync(path.join(root, "package.json"), "{}");
  return root;
}

describe("the dependencies of MSW", () => {
  test("are the packages it imports in a browser, through its own modules", () => {
    const root = projectWithMsw({
      "lib/core/index.mjs": [
        'import { invariant } from "outvariant";',
        'export { handle } from "./handle.mjs";',
      ].join("\n"),
      "lib/core/handle.mjs": [
        'import { WebSocketInterceptor } from "@mswjs/interceptors/WebSocket";',
        "export const handle = () => import('graphql');",
      ].join("\n"),
      "lib/browser/index.mjs": [
        'import { EventEmitter } from "node:events";',
        "import '../core/index.mjs';",
        "console.warn('Copy the worker script from \"public\"');",
      ].join("\n"),
      "lib/node/index.mjs": 'import yargs from "yargs";',
    });

    expect(mswDependencies(root)).toEqual([
      "msw > @mswjs/interceptors/WebSocket",
      "msw > graphql",
      "msw > outvariant",
    ]);
  });

  test("are none without MSW", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "msw-dependencies-"));
    onTestFinished(() => fs.rmSync(root, { recursive: true, force: true }));
    expect(mswDependencies(root)).toEqual([]);
  });

  // The ones an app found only once a test had loaded them, which reloaded
  // the page mid-run.
  test("of the MSW the notes demo has are those it imports deep in its modules", () => {
    const root = fileURLToPath(new URL("../../../playground/nextjs-notes-demo", import.meta.url));
    const dependencies = mswDependencies(root);

    expect(dependencies).toContain("msw > tough-cookie");
    expect(dependencies).toContain("msw > @mswjs/interceptors/WebSocket");
    expect(dependencies).not.toContain("msw > yargs");
  });
});

describe("the optimizer of the page", () => {
  const configureServer = (exclude: string[], page = { inNode: false }) => {
    const root = projectWithMsw({
      "lib/core/index.mjs": 'import "outvariant";',
      "lib/browser/index.mjs": 'import "../core/index.mjs";',
    });
    const optimizeDeps = { include: ["react"], exclude };
    const server = { config: { root, environments: { client: { optimizeDeps } } } };
    const hook = mswDependenciesPlugin(page).configureServer as (server: ViteDevServer) => void;
    hook(server as unknown as ViteDevServer);
    return optimizeDeps.include;
  };

  test("bundles MSW's dependencies where Browser Mode leaves MSW out", () => {
    expect(configureServer(["vitest/browser", "msw", "msw/browser"])).toEqual([
      "react",
      "msw > outvariant",
    ]);
  });

  test("does not where it bundles MSW itself", () => {
    expect(configureServer(["vitest/browser"])).toEqual(["react"]);
  });

  test("does not for a page in a worker of Node.js, which imports MSW itself", () => {
    expect(configureServer(["msw"], { inNode: true })).toEqual(["react"]);
  });
});
