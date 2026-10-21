// This package, as the app imports it: its name, and which of its modules
// Vite is to leave as they are.

import { createRequire } from "node:module";

// By the package's own name: from src/ and from wherever in dist/ this lands.
const pkg = createRequire(import.meta.url)("vitest-plugin-rsc/package.json") as {
  name: string;
  exports: Record<string, unknown>;
};

/** The package's name, `vitest-plugin-rsc`. */
export const ownName: string = pkg.name;

/** The export of the package's modules of Node.js, `vitest-plugin-rsc/node/<name>`. */
export const nodeModulesExport = "./node/*";
if (!(nodeModulesExport in pkg.exports)) {
  throw new Error(`vitest-plugin-rsc: package.json does not export ${nodeModulesExport}`);
}

/**
 * The package's own modules of a layer or a test file, for `optimizeDeps.exclude`:
 * `vitest-plugin-rsc/nextjs/ssr`, `vitest-plugin-rsc/testing-library` and so on.
 * Vite serves them as they are, not pre-bundled, so that Vite RSC compiles the
 * directives of the package's Server Action and Client Components, and a layer
 * and the test files share one copy. Each by its name, as Vite excludes a name
 * or a whole package: not the package, whose modules of Node.js (`./node/*`,
 * see nextjs/node-builtins.ts) are dependencies like any other, pre-bundled.
 */
export const ownModulesToExclude: string[] = Object.keys(pkg.exports)
  .filter((entry) => entry !== "." && entry !== "./package.json" && entry !== nodeModulesExport)
  .map((entry) => `${ownName}/${entry.slice("./".length)}`);
