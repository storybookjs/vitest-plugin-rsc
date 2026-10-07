import { resolveConfig, type Plugin } from "vite";
import { describe, expect, test } from "vitest";
import { vitestPluginRSC } from "./index.ts";

describe("react_client optimizer", () => {
  // Stands in for Vitest 5's vitest:environments-module-runner plugin, which in
  // browser mode disables the optimizer of every environment but `client`.
  const vitestRunnerPlugin: Plugin = {
    name: "vitest-runner",
    configEnvironment: {
      order: "post",
      handler(name, config) {
        if (name !== "client") config.optimizeDeps = { noDiscovery: true, include: [] };
      },
    },
  };

  async function resolveReactClientOptimizeDeps(...plugins: Plugin[]) {
    const config = await resolveConfig(
      { configFile: false, logLevel: "silent", plugins: [vitestPluginRSC(), ...plugins] },
      "serve",
    );
    return config.environments.react_client!.optimizeDeps;
  }

  test("survives Vitest disabling it", async () => {
    expect(await resolveReactClientOptimizeDeps(vitestRunnerPlugin)).toMatchObject({
      noDiscovery: false,
      include: expect.arrayContaining(["react", "react-dom/client", "react/jsx-runtime"]),
    });
  });

  test("keeps deps that other plugins add from configEnvironment", async () => {
    // A returned partial config is merged into a new environment config object.
    const addsDepPlugin: Plugin = {
      name: "adds-dep",
      configEnvironment(name) {
        if (name === "react_client") return { optimizeDeps: { include: ["some-dep"] } };
      },
    };

    expect(
      (await resolveReactClientOptimizeDeps(addsDepPlugin, vitestRunnerPlugin)).include,
    ).toContain("some-dep");
  });

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
