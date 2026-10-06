import type { EnvironmentOptions, Plugin } from "vite";

// An environment like react_client runs in the page through a module runner of
// this plugin, so it has its own dependency optimizer next to the one of the
// browser tests (`client`).
export function createRunnerEnvironmentPlugins(name: string): Plugin[] {
  // Vitest 5 serves browser tests from the project's Vite server, where its
  // `vitest:environments-module-runner` plugin configures every environment but
  // `client` for Node and disables their optimizer. React's CommonJS entries
  // would then reach the page raw. So take the environment's optimizeDeps from
  // right before that hook and put them back after it. (Its other overrides, like
  // keepProcessEnv, are harmless: the page defines `process`.) Once Vitest leaves
  // browser-consumed environments alone, this round trip changes nothing.
  let optimizeDeps: EnvironmentOptions["optimizeDeps"];

  return [
    {
      name: `rsc:runner-environment-optimizer:before-vitest:${name}`,
      // The first post hook, so it includes what earlier hooks contributed.
      enforce: "pre",
      configEnvironment: {
        order: "post",
        handler(environmentName, config) {
          if (environmentName === name) optimizeDeps = config.optimizeDeps;
        },
      },
    },
    {
      name: `rsc:runner-environment-optimizer:${name}`,
      enforce: "post",
      configEnvironment: {
        order: "post",
        handler(environmentName, config) {
          if (environmentName === name) config.optimizeDeps = optimizeDeps;
        },
      },
      configureServer(server) {
        // Vitest seeds the browser optimizer with the test and setup files once
        // the config is resolved. The environment later imports client components
        // from those files, so scan them too, or Vite discovers their deps
        // mid-test and reloads the page. Optimizers start on listen, after this.
        const client = server.config.environments.client!;
        const environment = server.config.environments[name]!;
        environment.optimizeDeps.entries ??= client.optimizeDeps.entries;
        environment.optimizeDeps.exclude = [
          ...new Set([
            ...(client.optimizeDeps.exclude ?? []),
            ...(environment.optimizeDeps.exclude ?? []),
          ]),
        ];
      },
    },
  ];
}
