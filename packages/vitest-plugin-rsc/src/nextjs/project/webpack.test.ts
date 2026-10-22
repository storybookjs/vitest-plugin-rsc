import { createRequire } from "node:module";
import { expect, test } from "vitest";
import { aliasOf, importOfFile, readWebpackFunction } from "./webpack.ts";

const options = { root: "/app", isServer: true, buildId: "vitest", config: {} };

// What `@next/mdx` adds to the config of webpack, without `experimental.mdxRs`.
const withMdx = (
  config: { resolve: { alias: Record<string, unknown> }; module: { rules: unknown[] } },
  { defaultLoaders }: { defaultLoaders: { babel: unknown } },
) => {
  config.resolve.alias["next-mdx-import-source-file"] = [
    "private-next-root-dir/src/mdx-components",
    "private-next-root-dir/mdx-components",
    "@mdx-js/react",
  ];
  config.module.rules.push({
    test: /\.mdx$/,
    use: [defaultLoaders.babel, { loader: "/loaders/mdx-js-loader.js", options: { a: 1 } }],
  });
  return config;
};

test("reads the rules and the aliases that the webpack function of next.config adds", () => {
  expect(readWebpackFunction(withMdx, options)).toEqual({
    rules: [
      {
        test: /\.mdx$/,
        loaders: [{ loader: "/loaders/mdx-js-loader.js", options: { a: 1 } }],
        compile: true,
      },
    ],
    aliases: {
      "next-mdx-import-source-file": [
        "/app/src/mdx-components",
        "/app/mdx-components",
        "@mdx-js/react",
      ],
    },
    differences: [],
  });
});

test("says what of the webpack function does not apply", () => {
  const read = readWebpackFunction(
    (config: { module: { rules: unknown[] }; plugins: unknown[] }) => {
      config.module.rules.push({ test: /\.svg$/, issuer: /\.tsx$/, use: ["@svgr/webpack"] });
      config.module.rules.push({ test: /\.txt$/, use: "raw-loader" });
      config.plugins.push({});
      return config;
    },
    options,
  );

  expect(read.rules).toEqual([
    { test: /\.txt$/, loaders: [{ loader: "raw-loader", options: undefined }], compile: false },
  ]);
  expect(read.differences).toEqual([
    expect.stringMatching(/a rule of the `webpack` function .* not \/\\\.svg\$\//),
    expect.stringMatching(/the plugins of webpack .* do not run/),
  ]);
  expect(
    readWebpackFunction(() => {
      throw new Error("no webpack here");
    }, options).differences,
  ).toEqual([expect.stringMatching(/failed, so none of it applies: no webpack here/)]);
  expect(readWebpackFunction(undefined, options)).toEqual({
    rules: [],
    aliases: {},
    differences: [],
  });
});

test("takes an alias as webpack does: for what is under it too, unless it ends with $", () => {
  const aliases = { a: ["/x/a"], b$: ["/x/b.js"] };

  expect(aliasOf(aliases, "a")).toEqual(["/x/a"]);
  expect(aliasOf(aliases, "a/c.js")).toEqual(["/x/a/c.js"]);
  expect(aliasOf(aliases, "ab")).toBeUndefined();
  expect(aliasOf(aliases, "b")).toEqual(["/x/b.js"]);
  expect(aliasOf(aliases, "b/c.js")).toBeUndefined();
});

test("names a file of a package by its import, for Vite to pre-bundle it", () => {
  const file = createRequire(import.meta.url).resolve("magic-string");

  expect(importOfFile(file)).toMatch(/^magic-string\/dist\/magic-string\.[\w.]+js$/);
  expect(importOfFile("/app/mdx-components")).toBe("/app/mdx-components");
  expect(importOfFile("@mdx-js/react")).toBe("@mdx-js/react");
});
