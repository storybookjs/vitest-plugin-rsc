import { fileURLToPath } from "node:url";
import { createServer, normalizePath, type Plugin } from "vite";
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
  // The config of a server that Vitest runs tests on, with its plugin.
  const configOf = async (test: Record<string, unknown>, command = "serve") => {
    const config = getHookHandler(getPlugin("rsc:page-in-worker").config);
    const plugins = [{ name: "vitest:config" }];
    await config.call({} as never, { root: "/app", plugins, test } as never, { command } as never);
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

  test("is not there in a build, whose page is in a browser", async () => {
    expect((await configOf({ environment: "jsdom" }, "build")).pool).toBeUndefined();
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

  // Node's are those of `vitestPluginNext()`, which gives the server Node's
  // own modules: see nextjs/plugin.test.ts.
  test("has a browser's conditions with the page in a worker of Node.js too", () => {
    expect(resolveOf({ environment: "jsdom" })).toEqual({
      conditions: ["browser", "react-server"],
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

describe("node:async_hooks", () => {
  // With a cold cache, a dependency the optimizer of the page learns of while
  // a test runs has it pre-bundle again and reload the page.
  test("is no dependency for the optimizers of the page to find", async () => {
    const root = fileURLToPath(new URL("../../../playground/nextjs-e2e-demo", import.meta.url));
    const server = await createServer({
      root,
      configFile: false,
      logLevel: "silent",
      server: { middlewareMode: true, ws: false },
      // The package where an app has it, in its `node_modules`, not the
      // workspace's folder of the package that the link points to.
      resolve: { preserveSymlinks: true },
      cacheDir: fileURLToPath(new URL("../node_modules/.vite-async-hooks-test", import.meta.url)),
      plugins: [vitestPluginRSC()],
    });
    try {
      for (const name of ["client", "react_client"]) {
        const environment = server.environments[name]!;
        const resolved = await environment.pluginContainer.resolveId(
          "node:async_hooks",
          `${root}/app/page.tsx`,
        );
        const optimizer = environment.depsOptimizer!;
        expect(optimizer.isOptimizedDepFile(resolved!.id)).toBe(false);
        expect(optimizer.metadata.discovered).not.toHaveProperty(["node:async_hooks"]);
      }
    } finally {
      await server.close();
    }
  });
});

describe("the source maps of the page's modules", () => {
  const transform = getHookHandler(getPlugin("rsc:dependency-source-map").transform);
  const builtFile = normalizePath(
    fileURLToPath(new URL("../dist/node/stream.js", import.meta.url)),
  );
  // A browser's environment, or one of a layer that a module runner runs.
  const environmentOf = (moduleRunnerTransform: boolean) => ({
    mode: "dev",
    config: { consumer: "client", dev: { moduleRunnerTransform } },
    depsOptimizer: { isOptimizedDepFile: (id: string) => id.includes("/.vite/deps/") },
  });
  const mapOf = (id: string, moduleRunnerTransform = false) =>
    (
      transform.call({ environment: environmentOf(moduleRunnerTransform) } as never, "x", id) as {
        map?: unknown;
      } | void
    )?.map;

  test("in a browser, are none for a pre-bundled dependency and this package's own", () => {
    for (const id of [
      "/app/node_modules/.vite/deps/react.js?v=1",
      builtFile,
      "\0virtual:vitest-plugin-rsc/next-manifest",
    ]) {
      expect(mapOf(id)).toEqual({ mappings: "" });
    }
  });

  test("in a browser, stay for the app's modules and a dependency that is not bundled", () => {
    expect(mapOf("/app/src/page.tsx")).toBeUndefined();
    expect(mapOf("/app/node_modules/msw/lib/core/index.mjs")).toBeUndefined();
  });

  test("of a layer, are none for any dependency", () => {
    expect(mapOf("/app/node_modules/msw/lib/core/index.mjs", true)).toEqual({ mappings: "" });
    expect(mapOf("/app/src/page.tsx", true)).toBeUndefined();
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
