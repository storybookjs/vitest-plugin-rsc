/// <reference types="node" />

import { registerHooks } from "node:module";

const vitestPluginRscSourceCondition = "vitest-plugin-rsc-source";
const nodeConditions = getNodeConditions();

export const vitestPluginRscSourceConditions = nodeConditions.includes(
  vitestPluginRscSourceCondition,
)
  ? [vitestPluginRscSourceCondition]
  : [];

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
