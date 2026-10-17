/// <reference types="node" />

import { registerHooks } from "node:module";

// The export conditions that resolve a package of the repo to its source
// instead of its build. `pnpm test` runs Node with them, `pnpm test:dist`
// without.
const vitestPluginRscSourceCondition = "vitest-plugin-rsc-source";
const storybookNextjsViteRscSourceCondition = "storybook-nextjs-vite-rsc-source";
const nodeConditions = getNodeConditions();

export const vitestPluginRscSourceConditions = activeConditions(vitestPluginRscSourceCondition);

export const storybookNextjsViteRscSourceConditions = activeConditions(
  storybookNextjsViteRscSourceCondition,
);

function activeConditions(condition: string): string[] {
  return nodeConditions.includes(condition) ? [condition] : [];
}

function getNodeConditions(): string[] {
  let conditions: string[] = [];

  const hooks = registerHooks({
    resolve(specifier, context, nextResolve) {
      conditions = context.conditions;
      return nextResolve(specifier, context);
    },
  });

  try {
    // Trigger one resolution so Node exposes the active package export conditions.
    import.meta.resolve("node:fs");
  } finally {
    hooks.deregister();
  }

  return conditions;
}
