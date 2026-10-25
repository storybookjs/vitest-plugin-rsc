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

describe("the pool of a page in a worker of Node.js", () => {
  const configOf = async (test: Record<string, unknown>) => {
    const config = getHookHandler(getPlugin("rsc:page-in-worker").config);
    await config.call({} as never, { root: "/app", test } as never, {} as never);
    return test;
  };

  test("is the plugin's, in happy-dom or jsdom without Browser Mode", async () => {
    for (const environment of ["happy-dom", "jsdom"]) {
      expect((await configOf({ environment })).pool).toMatchObject({ name: "vitest-plugin-rsc" });
      expect((await configOf({ environment, pool: "forks" })).pool).toMatchObject({
        name: "vitest-plugin-rsc",
      });
    }
  });

  test("is Vitest's for any other project", async () => {
    expect((await configOf({ environment: "node" })).pool).toBeUndefined();
    expect(
      (await configOf({ environment: "happy-dom", browser: { enabled: true } })).pool,
    ).toBeUndefined();
  });

  test("says so where the project sets another pool", async () => {
    await expect(configOf({ environment: "happy-dom", pool: "threads" })).rejects.toThrow(
      'This project sets `test.pool` to "threads": leave it out, or set it to "forks".',
    );
    await expect(
      configOf({ environment: "jsdom", pool: { name: "custom", createPoolWorker() {} } }),
    ).rejects.toThrow('sets `test.pool` to "custom"');
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
