import fs from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import type { Alias, Plugin, UserConfig } from "vite";
import { expect, test } from "vitest";
import { nextTesterHtmlPath, vitestPluginNext } from "./plugin";

const fixtureRoot = fileURLToPath(
  new URL("../../../../playground/nextjs-notes-demo/", import.meta.url),
);

test("aliases React packages through Next's vendored React for app-router environments", async () => {
  const config = await resolveNextPluginConfig();

  const rscAliases = getEnvironmentAliases(config, "client");
  expect(findAlias(rscAliases, "react")).toContain("next/dist/compiled/react/react.react-server");
  expect(findAlias(rscAliases, "react/compiler-runtime")).toContain(
    "next/dist/compiled/react/compiler-runtime",
  );
  expect(findAlias(rscAliases, "react/jsx-dev-runtime")).toContain(
    "next/dist/compiled/react/jsx-dev-runtime.react-server",
  );
  expect(findAlias(rscAliases, "react/jsx-runtime")).toContain(
    "next/dist/compiled/react/jsx-runtime.react-server",
  );
  expect(findAlias(rscAliases, "react-dom")).toContain(
    "next/dist/compiled/react-dom/react-dom.react-server",
  );
  expect(findAlias(rscAliases, "react-dom/server")).toContain(
    "next/dist/build/webpack/alias/react-dom-server",
  );
  expect(findAlias(rscAliases, "react-dom/static")).toContain(
    "next/dist/compiled/react-dom/static.edge",
  );
  expect(findAlias(rscAliases, "react-server-dom-webpack/server")).toBe(
    "@vitejs/plugin-rsc/vendor/react-server-dom/server.edge",
  );

  const browserAliases = getEnvironmentAliases(config, "react_client");
  expect(findAlias(browserAliases, "react")).toContain("next/dist/compiled/react/index.js");
  expect(findAlias(browserAliases, "react/compiler-runtime")).toContain(
    "next/dist/compiled/react/compiler-runtime",
  );
  expect(findAlias(browserAliases, "react/jsx-dev-runtime")).toContain(
    "next/dist/compiled/react/jsx-dev-runtime",
  );
  expect(findAlias(browserAliases, "react/jsx-runtime")).toContain(
    "next/dist/compiled/react/jsx-runtime",
  );
  expect(findAlias(browserAliases, "react-dom/client")).toContain(
    "next/dist/compiled/react-dom/client",
  );
  expect(findAlias(browserAliases, "react-dom/server")).toContain(
    "next/dist/compiled/react-dom/server.browser",
  );
  expect(findAlias(browserAliases, "react-dom/static")).toContain(
    "next/dist/compiled/react-dom/static.browser",
  );
  expect(findAlias(browserAliases, "react-server-dom-webpack/client")).toContain(
    "@vitejs/plugin-rsc",
  );
  expect(findAlias(browserAliases, "react-server-dom-webpack/client")).toContain(
    "react-server-dom/client.browser",
  );

  const rscDefine = getEnvironmentDefine(config, "client");
  expect(rscDefine["process.env.NEXT_RUNTIME"]).toBe('"edge"');
  expect(rscDefine["process.env.__NEXT_EXPERIMENTAL_AUTH_INTERRUPTS"]).toBe("true");
  expect(rscDefine["process.env.__NEXT_BUNDLER"]).toBe('"Webpack"');
  expect(rscDefine["process.env.__NEXT_DEV_SERVER"]).toBe('""');

  const browserDefine = getEnvironmentDefine(config, "react_client");
  expect(browserDefine["process.env.NEXT_RUNTIME"]).toBe('""');
  expect(browserDefine["process.browser"]).toBe("true");
});

test("sets the Next tester HTML in Vitest browser projects by default", async () => {
  const config = await resolveNextPluginConfig();

  expect(getBrowserTesterHtmlPath(config)).toBe(nextTesterHtmlPath);
});

test("does not replace a user-provided Vitest browser tester HTML", async () => {
  const config = await resolveNextPluginConfig({
    test: {
      browser: {
        testerHtmlPath: "/custom/tester.html",
      },
    },
  } as UserConfig);

  expect(getBrowserTesterHtmlPath(config)).toBeUndefined();
});

test("does not replace user-provided Vitest browser instance tester HTML", async () => {
  const config = await resolveNextPluginConfig({
    test: {
      browser: {
        instances: [{ testerHtmlPath: "/custom/chromium.html" }],
      },
    },
  } as UserConfig);

  expect(getBrowserTesterHtmlPath(config)).toBeUndefined();
});

test("replaces next/root-params through Next's root params loader", async () => {
  const plugin = findNextPlugin("next-rsc-root-params:client");
  const configResolved = getHookHandler(plugin.configResolved);
  const resolveId = getHookHandler(plugin.resolveId);
  const load = getHookHandler(plugin.load);
  const previousCwd = process.cwd();

  process.chdir(fixtureRoot);
  try {
    await configResolved.call({} as never, { root: fixtureRoot, mode: "test" } as never);

    expect(await resolveId.call({} as never, "next/root-params", undefined, {} as never)).toBe(
      "\0vitest-plugin-rsc:next-root-params",
    );
    expect(await load.call({} as never, "\0vitest-plugin-rsc:next-root-params", {} as never)).toBe(
      "export {}",
    );
  } finally {
    process.chdir(previousCwd);
  }
});

test("keeps the Next entry-base adapter aligned with Next's export surface", async () => {
  const plugin = findNextPlugin("next-rsc-entry-base");
  const load = getHookHandler(plugin.load);
  const code = (await load.call(
    {} as never,
    "\0vitest-plugin-rsc:next-entry-base",
    {} as never,
  )) as string;

  expect(parseEntryBaseExports(code)).toEqual(parseRealNextEntryBaseExports());
});

async function resolveNextPluginConfig(userConfig: UserConfig = {}): Promise<UserConfig> {
  const previousCwd = process.cwd();
  const plugin = findNextPlugin("next-rsc-plugin");

  const config = getHookHandler(plugin.config);
  process.chdir(fixtureRoot);
  try {
    return (await config.call(
      {} as never,
      { root: fixtureRoot, ...userConfig } as never,
      { command: "serve", mode: "test", isPreview: false, isSsrBuild: false } as never,
    )) as UserConfig;
  } finally {
    process.chdir(previousCwd);
  }
}

function findNextPlugin(name: string): Plugin {
  const plugin = vitestPluginNext().find((candidate) => candidate.name === name);
  if (!plugin) throw new Error(`Could not find ${name}.`);
  return plugin;
}

function findAlias(aliases: Alias[], find: string) {
  const match = aliases.find((alias): alias is Alias & { find: string } => alias.find === find);
  if (!match) throw new Error(`Expected alias for ${find}.`);
  return match.replacement;
}

function getEnvironmentAliases(config: UserConfig, environment: string): Alias[] {
  const resolve = config.environments?.[environment]?.resolve as { alias?: Alias[] } | undefined;
  return resolve?.alias ?? [];
}

function getEnvironmentDefine(config: UserConfig, environment: string): Record<string, string> {
  return (config.environments?.[environment]?.define ?? {}) as Record<string, string>;
}

function getBrowserTesterHtmlPath(config: UserConfig): string | undefined {
  return (config as { test?: { browser?: { testerHtmlPath?: string } } }).test?.browser
    ?.testerHtmlPath;
}

function getHookHandler<T extends (...args: never[]) => unknown>(
  hook: T | { handler: T } | undefined,
): T {
  if (!hook) throw new Error("Expected Vite hook to be defined.");
  return typeof hook === "function" ? hook : hook.handler;
}

function parseEntryBaseExports(code: string) {
  const exportBlocks = [...code.matchAll(/export\s*\{([\s\S]*?)\};/g)]
    .flatMap((match) => match[1]!.split(","))
    .map((name) => name.trim())
    .map((name) => name.match(/\s+as\s+([A-Za-z0-9_$]+)$/)?.[1] ?? name)
    .filter(Boolean);
  const exportDeclarations = [...code.matchAll(/export\s+(?:const|function)\s+([A-Za-z0-9_$]+)/g)]
    .map((match) => match[1]!)
    .filter(Boolean);

  return [...new Set([...exportBlocks, ...exportDeclarations])].sort();
}

function parseRealNextEntryBaseExports() {
  const projectRequire = createRequire(new URL("package.json", `file://${fixtureRoot}/`));
  const entryBasePath = projectRequire.resolve("next/dist/server/app-render/entry-base.js");
  const source = fs.readFileSync(entryBasePath, "utf8");
  const exportShape = source.match(/0 && \(module\.exports = \{([\s\S]*?)\}\);/)?.[1];

  if (!exportShape) {
    throw new Error("Could not find Next entry-base export shape.");
  }

  return [...exportShape.matchAll(/^\s*([A-Za-z0-9_$]+):/gm)].map((match) => match[1]!).sort();
}
