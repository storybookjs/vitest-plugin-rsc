import type { Plugin } from "vite";

// The Vite plugins of a host, like Storybook's, are for the host's own
// environment: the rsc layer, which the host shares. The other two layers are
// the app's, and a plugin that injects the runtime of the host, or maps its
// packages to globals of its page, breaks them. Vite applies a plugin to every
// environment unless the plugin says otherwise, so this says it for the
// plugins that `host.plugins` names, with their `applyToEnvironment`. A host
// adds some of its plugins late, so this looks at the resolved list.

/** Whether a plugin is one that `host.plugins` names. */
const isNamedIn = (names: (string | RegExp)[], name: string): boolean =>
  names.some((named) => (typeof named === "string" ? named === name : named.test(name)));

export function hostPlugins(names: (string | RegExp)[], environment: string): Plugin {
  const scoped = new WeakSet<Plugin>();
  return {
    name: "vitest-plugin-rsc:next-host-plugins",
    configResolved(config) {
      if (names.length === 0) return;
      for (const plugin of config.plugins) {
        if (scoped.has(plugin) || !isNamedIn(names, plugin.name)) continue;
        scoped.add(plugin);
        const { applyToEnvironment } = plugin;
        (plugin as Plugin).applyToEnvironment = (target) =>
          target.name === environment && (applyToEnvironment?.(target) ?? true);
      }
    },
  };
}
