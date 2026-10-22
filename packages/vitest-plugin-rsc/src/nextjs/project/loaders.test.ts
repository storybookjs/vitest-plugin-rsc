import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { openNextProject } from "./context.ts";
import { createLoaders, sassPreprocessorOptions, type Loader } from "./loaders.ts";

const root = fileURLToPath(new URL("../../../../../playground/nextjs-e2e-demo", import.meta.url));
const envWorker = fileURLToPath(new URL("./env-worker.ts", import.meta.url));

test("gives Vite the options of Sass in sassOptions of next.config, as Next gives sass-loader", () => {
  expect(
    sassPreprocessorOptions(
      {
        implementation: "sass-embedded",
        prependData: "$color: red;",
        additionalData: "$color: blue;",
        loadPaths: ["styles", "/shared"],
        quietDeps: true,
      },
      "/app",
    ),
  ).toEqual({
    additionalData: "$color: red;",
    loadPaths: ["/app/styles", "/shared"],
    quietDeps: true,
  });
  expect(sassPreprocessorOptions({ additionalData: "$a: 1;" }, "/app")).toEqual({
    additionalData: "$a: 1;",
  });
  // Next's default, and only an implementation.
  expect(sassPreprocessorOptions({}, "/app")).toBeUndefined();
  expect(sassPreprocessorOptions({ implementation: "sass" }, "/app")).toBeUndefined();
});

test("calls a function of additionalData with what sass-loader gives it", () => {
  const options = sassPreprocessorOptions(
    {
      additionalData: (source: string, context: { resourcePath: string; rootContext: string }) =>
        `/* ${context.rootContext} ${context.resourcePath} */ ${source}`,
    },
    "/app",
  )!;

  expect(
    (options.additionalData as (source: string, file: string) => string)("a {}", "/app/a.scss"),
  ).toBe("/* /app /app/a.scss */ a {}");
});

test("gives a loader the build as webpack's mode, not the NODE_ENV of the process", async () => {
  const context = await openNextProject(root, createRequire(path.join(root, "package.json")), {
    envWorker,
  });
  const mode: Loader = function () {
    return this.mode;
  };
  // A file the loader does not read.
  const file = path.join(root, "app/page.mdx");

  // Vitest's NODE_ENV, which is neither.
  expect(process.env.NODE_ENV).toBe("test");
  expect(await createLoaders(context, "production").runLoader(mode, undefined, file)).toEqual([
    "production",
  ]);
  expect(await createLoaders(context, "development").runLoader(mode, undefined, file)).toEqual([
    "development",
  ]);
});
