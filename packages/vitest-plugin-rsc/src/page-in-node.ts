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

type TestOptions = { browser?: { enabled?: boolean }; environment?: string };

export function hostsPageInNode(test: TestOptions | undefined): boolean {
  return !test?.browser?.enabled && domEnvironments.has(test?.environment ?? "");
}

// The plugin that Vitest puts in the config of every server it runs tests
// on, the one of the root and the one of each project, and in no other.
// Not `process.env.VITEST`: a process that Vitest starts has it too, like
// the `storybook dev` of Storybook's Vitest addon.
const vitestConfigPlugin = "vitest:config";

/**
 * Whether Vitest runs tests on the dev server of this config, as a `config`
 * hook sees it. Not a build, nor the dev server of another host, whose
 * config can have a `test` all the same: Storybook's builder merges the
 * project's `vite.config.ts` into its own.
 */
export function isTestServer(config: { plugins?: unknown[] }, command: string): boolean {
  return (
    command === "serve" &&
    (config.plugins ?? [])
      .flat(Infinity)
      .some((plugin) => (plugin as { name?: unknown } | null)?.name === vitestConfigPlugin)
  );
}

/** Whether the server of this config is made for a page in a worker of Node.js. */
export function servesPageInNode(
  config: { plugins?: unknown[]; test?: TestOptions },
  command: string,
): boolean {
  return isTestServer(config, command) && hostsPageInNode(config.test);
}

type InlineProject = { extends?: unknown; test?: TestOptions };

/**
 * Whether an inline project of `test.projects` hosts its page in a worker of
 * Node.js. Vitest resolves an inline project that changes no option of Vite,
 * like one that differs from the config that declares it in `environment`
 * only, with that config's server, and without the `config` hooks of its
 * plugins: those that make a server the host of a page in Node.js, and give
 * the project the plugin's pool. Such a project needs a server of its own.
 */
export function projectsHostPageInNode(test: TestOptions & { projects?: unknown[] }): boolean {
  return (test.projects ?? []).some((entry) => {
    if (typeof entry !== "object" || entry === null) return false;
    const project = entry as InlineProject;
    const inherited = project.extends === false ? {} : test;
    return hostsPageInNode({
      environment: project.test?.environment ?? inherited.environment,
      browser: project.test?.browser ?? inherited.browser,
    });
  });
}
