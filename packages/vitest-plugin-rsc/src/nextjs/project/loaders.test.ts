import { expect, test } from "vitest";
import { sassPreprocessorOptions } from "./loaders.ts";

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
