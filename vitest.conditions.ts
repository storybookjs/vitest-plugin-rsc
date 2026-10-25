// The export conditions that resolve a package of the repo to its source
// instead of its build. `pnpm test` runs Node or Bun with them, `pnpm
// test:dist` without. The runtime's resolver tells whether they are on, as
// Node takes them from `--conditions` or NODE_OPTIONS and Bun from its own
// `--conditions` only, and Bun has no `module.registerHooks` to ask.
export const vitestPluginRscSourceConditions = activeConditions(
  "vitest-plugin-rsc",
  "vitest-plugin-rsc-source",
  "./packages/vitest-plugin-rsc/src/index.ts",
);

export const storybookNextjsViteRscSourceConditions = activeConditions(
  "@storybook/nextjs-vite-rsc",
  "storybook-nextjs-vite-rsc-source",
  "./packages/storybook-nextjs-vite-rsc/src/index.ts",
);

function activeConditions(specifier: string, condition: string, source: string): string[] {
  return resolve(specifier) === new URL(source, import.meta.url).href ? [condition] : [];
}

// Bun's resolver throws for a package that is not built yet, where Node's
// returns the path of the build all the same: either way not the source.
function resolve(specifier: string): string | undefined {
  try {
    return import.meta.resolve(specifier);
  } catch {
    return undefined;
  }
}
