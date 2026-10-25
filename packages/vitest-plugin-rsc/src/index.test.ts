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

describe("the server's resolution", () => {
  type Resolve = { conditions: string[]; mainFields?: string[] };
  const resolveOf = (test: object) => {
    const config = getHookHandler(getPlugin("rsc:run-in-browser").config) as unknown as (
      config: object,
    ) => { environments: { client: { resolve: Resolve } } };
    return config({ test }).environments.client.resolve;
  };

  test("has a browser's conditions with the page in a browser", () => {
    expect(resolveOf({ browser: { enabled: true }, environment: "happy-dom" })).toEqual({
      conditions: ["browser", "react-server"],
    });
  });

  test("has Node's conditions and fields with the page in a worker of Node.js", () => {
    expect(resolveOf({ environment: "jsdom" })).toEqual({
      conditions: ["node", "react-server"],
      mainFields: ["module", "jsnext:main", "jsnext"],
    });
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
