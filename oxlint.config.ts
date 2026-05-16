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
    "eslint/no-unused-vars": "off",
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
});
