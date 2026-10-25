// Whether a project of Vitest hosts its page in a worker of Node.js, with a
// DOM of its own: a project without Browser Mode, in the environment of
// happy-dom or jsdom. Only there the plugin is the page's host (node-host.ts),
// with what that host needs: the listener for the page, the settings of the
// worker and its own pre-bundles, and in `vitestPluginNext()` Node's own
// modules for the server layers (nextjs/node-builtins.ts). Another host, like
// Storybook, a static build or a project of Browser Mode, has none of it, and
// neither has a project of Node.js without a DOM, which renders no page. By
// its config, which a plugin like `vitestPluginNext()` gives `test` for any
// host: Vitest has merged its command line into it before any `config` hook.

const domEnvironments = new Set(["happy-dom", "jsdom"]);

/**
 * The file of the plugin's environment of happy-dom, which takes the place of
 * Vitest's in such a project: see happy-dom-environment.ts.
 */
const isOwnHappyDomEnvironment = (environment: string): boolean =>
  /[\\/]happy-dom-environment\.[jt]s$/.test(environment);

export function hostsPageInNode(
  test: { browser?: { enabled?: boolean }; environment?: string } | undefined,
): boolean {
  const environment = test?.environment ?? "";
  return (
    !test?.browser?.enabled &&
    (domEnvironments.has(environment) || isOwnHappyDomEnvironment(environment))
  );
}
