import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import { resolveConfig, type Plugin, type UserConfig } from "vite";
import { vitestPluginRSC } from "./index";

let fixtureRoots: string[] = [];

afterEach(async () => {
  await Promise.all(fixtureRoots.map((root) => rm(root, { recursive: true, force: true })));
  fixtureRoots = [];
});

test("discovers use client files as React client optimizer entries", async () => {
  const root = await createFixture({
    "src/client.tsx": `
      // Comments may appear before directive prologues.
      "use client";
      import { useState } from "react";
      export function Client() {
        return useState(null);
      }
    `,
    "src/nested/single-quote.tsx": `
      'use client'
      export const value = 1;
    `,
    "src/server.tsx": `
      import { Client } from "./client";
      export function Server() {
        return <Client />;
      }
    `,
    "src/not-a-directive.tsx": `
      import "server-only";
      "use client";
    `,
  });

  const config = await resolveRscConfig(root);

  expect(config.environments.react_client!.optimizeDeps.entries).toEqual([
    "src/client.tsx",
    "src/nested/single-quote.tsx",
  ]);
});

test("falls back to source globs when no use client entries are found", async () => {
  const root = await createFixture({
    "src/server.tsx": `
      export function Server() {
        return null;
      }
    `,
  });

  const config = await resolveRscConfig(root);

  expect(config.environments.react_client!.optimizeDeps.entries).toEqual([
    "src/**/*.{js,jsx,ts,tsx}",
    "app/**/*.{js,jsx,ts,tsx}",
    "components/**/*.{js,jsx,ts,tsx}",
  ]);
});

test("keeps user-provided React client optimizer entries", async () => {
  const root = await createFixture({
    "src/client.tsx": `
      "use client";
      export const value = 1;
    `,
  });

  const config = await resolveRscConfig(root, {
    environments: {
      react_client: {
        optimizeDeps: {
          entries: ["custom-client-entry.tsx"],
        },
      },
    },
  });

  expect(config.environments.react_client!.optimizeDeps.entries).toEqual([
    "custom-client-entry.tsx",
  ]);
});

test("detects Vitest browser config before browser plugins are injected", async () => {
  const root = await createFixture({
    "src/client.tsx": `
      "use client";
      export const value = 1;
    `,
  });

  const config = await resolveRscConfig(
    root,
    {
      test: {
        browser: {
          enabled: true,
        },
      },
    } as UserConfig,
    false,
  );

  expect(config.environments.react_client!.optimizeDeps.entries).toEqual(["src/client.tsx"]);
});

test("disables client optimizers outside Vitest browser mode", async () => {
  const root = await createFixture({
    "src/client.tsx": `
      "use client";
      export const value = 1;
    `,
  });

  const config = await resolveRscConfig(root, {}, false);

  expect(config.environments.client!.optimizeDeps).toMatchObject({
    noDiscovery: true,
    include: [],
    entries: [],
  });
  expect(config.environments.react_client!.optimizeDeps).toMatchObject({
    noDiscovery: true,
    include: [],
    entries: [],
  });
});

async function resolveRscConfig(
  root: string,
  inlineConfig: UserConfig = {},
  includeBrowserPlugin = true,
) {
  return resolveConfig(
    {
      ...inlineConfig,
      configFile: false,
      root,
      logLevel: "silent",
      plugins: [
        vitestPluginRSC(),
        ...(includeBrowserPlugin ? [vitestBrowserPlugin()] : []),
        ...(inlineConfig.plugins ? [inlineConfig.plugins] : []),
      ],
      server: {
        middlewareMode: true,
        ws: false,
        ...inlineConfig.server,
      },
    },
    "serve",
  );
}

function vitestBrowserPlugin(): Plugin {
  return { name: "vitest:browser" };
}

async function createFixture(files: Record<string, string>) {
  const root = await mkdtemp(path.join(tmpdir(), "vitest-plugin-rsc-"));
  fixtureRoots.push(root);

  await Promise.all(
    Object.entries(files).map(async ([file, contents]) => {
      const absolutePath = path.join(root, file);
      await mkdir(path.dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, contents);
    }),
  );

  return root;
}
