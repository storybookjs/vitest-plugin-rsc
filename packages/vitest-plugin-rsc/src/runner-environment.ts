import type { Plugin } from "vite";

// An environment like react_client runs in the page through a module runner of
// this plugin, so it has its own dependency optimizer next to the one of the
// browser tests (`client`).
export function createRunnerEnvironmentPlugins(name: string): Plugin[] {
  return [
    {
      name: `rsc:runner-environment-optimizer:${name}`,
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
