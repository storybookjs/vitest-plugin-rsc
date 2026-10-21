import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { nodeModulesExport, ownModulesToExclude, ownName } from "./own-package.ts";

const src = fileURLToPath(new URL("./", import.meta.url));

test("excludes the package's own modules from pre-bundling by name, not its modules of Node.js", () => {
  expect(ownName).toBe("vitest-plugin-rsc");
  expect(nodeModulesExport).toBe("./node/*");
  expect(ownModulesToExclude).toEqual([
    "vitest-plugin-rsc/async-hooks",
    "vitest-plugin-rsc/testing-library",
    "vitest-plugin-rsc/testing-library-client",
    "vitest-plugin-rsc/nextjs/testing-library",
    "vitest-plugin-rsc/nextjs/client-components",
    "vitest-plugin-rsc/nextjs/plugin",
    "vitest-plugin-rsc/nextjs/rsc",
    "vitest-plugin-rsc/nextjs/ssr",
    "vitest-plugin-rsc/nextjs/client",
    "vitest-plugin-rsc/nextjs/node-rendered",
  ]);
});

test("covers every module of the package that its own code names, but its modules of Node.js", () => {
  const exports = Object.keys(
    JSON.parse(fs.readFileSync(path.join(src, "../package.json"), "utf8")).exports,
  );
  const named = new Set<string>();
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith(".test.ts")) {
        for (const match of fs
          .readFileSync(file, "utf8")
          .matchAll(/["'](vitest-plugin-rsc\/[^"'`]+)["']/g)) {
          named.add(match[1]!);
        }
      }
    }
  };
  walk(src);
  // An export, by the specifier: not a virtual id like `vitest-plugin-rsc/component`.
  const modules = [...named].filter(
    (specifier) =>
      exports.includes(`./${specifier.slice(ownName.length + 1)}`) && !specifier.endsWith(".json"),
  );
  expect(modules.length).toBeGreaterThan(3);
  for (const specifier of modules) expect(ownModulesToExclude, specifier).toContain(specifier);
  expect(ownModulesToExclude.some((module) => module.startsWith(`${ownName}/node/`))).toBe(false);
});
