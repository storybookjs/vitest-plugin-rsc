import { fileURLToPath } from "node:url";
import { normalizePath, type Plugin } from "vite";
import { describe, expect, test } from "vitest";
import { vitestPluginRSC } from "./index.ts";

describe("the page's host", () => {
  test("in a browser is the browser host's own file, with no module in between", async () => {
    const resolveId = getHookHandler(getPlugin("rsc:run-in-browser").resolveId);
    const resolved = await resolveId.call(
      {} as never,
      "virtual:vitest-plugin-rsc/page-host",
      undefined,
      {} as never,
    );
    expect(resolved).toBe(
      normalizePath(fileURLToPath(new URL("browser-host.ts", import.meta.url))),
    );
  });
});

describe("react_client optimizer", () => {
  test("scans the browser test files and shares their excludes", async () => {
    const configureOptimizer = getHookHandler(
      getPlugin("rsc:runner-environment-optimizer:react_client").configureServer,
    );
    const environments = {
      client: { optimizeDeps: { entries: ["/src/app.test.tsx"], exclude: ["msw"] } },
      react_client: { optimizeDeps: { exclude: ["vitest-plugin-rsc"] } },
    };

    await configureOptimizer.call({} as never, { config: { environments } } as never);

    expect(environments.react_client.optimizeDeps).toEqual({
      entries: ["/src/app.test.tsx"],
      exclude: ["msw", "vitest-plugin-rsc"],
    });
  });
});

function getPlugin(name: string): Plugin {
  const plugin = vitestPluginRSC().find((candidate) => candidate.name === name);
  if (!plugin) throw new Error(`Could not find ${name}.`);
  return plugin;
}

function getHookHandler<T extends (...args: never[]) => unknown>(
  hook: T | { handler: T } | undefined,
): T {
  if (!hook) throw new Error("Expected Vite hook to be defined.");
  return typeof hook === "function" ? hook : hook.handler;
}
