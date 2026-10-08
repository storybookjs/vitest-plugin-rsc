import { defineConfig } from "oxlint";

export default defineConfig({
  ignorePatterns: ["**/mockServiceWorker.js"],
  options: {
    typeAware: true,
    typeCheck: true,
  },
  plugins: [
    "typescript",
    "unicorn",
    "oxc",
    "react",
    "nextjs",
    "import",
    "jsx-a11y",
    "promise",
    "react-perf",
    "node",
  ],
  categories: {
    correctness: "error",
  },
  rules: {
    "eslint/no-unused-vars": "error",
    "import/extensions": [
      "error",
      "always",
      {
        checkTypeImports: true,
        ignorePackages: true,
      },
    ],
    "nextjs/no-img-element": "off",
    "typescript/no-base-to-string": "off",
    "typescript/no-redundant-type-constituents": "off",
    "typescript/unbound-method": "off",
    "unicorn/no-useless-fallback-in-spread": "off",
  },
  env: {
    builtin: true,
  },
  overrides: [
    {
      // The source of the package is ES modules. A bare `require` type-checks
      // as Node's global, which a module does not have: it has to come from
      // `createRequire()`.
      files: ["packages/vitest-plugin-rsc/src/**"],
      rules: {
        "eslint/no-restricted-globals": [
          "error",
          { name: "require", message: "An ES module has no `require`. Use `createRequire()`." },
          { name: "module", message: "An ES module has no `module`." },
          { name: "exports", message: "An ES module has no `exports`." },
        ],
      },
    },
  ],
});
