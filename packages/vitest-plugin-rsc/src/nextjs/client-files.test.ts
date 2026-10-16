import { expect, test } from "vitest";
import { hostModulePrefix, isHostModule } from "../host-module.ts";
import { clientEntries, clientFiles, renderServerError } from "./client-files.ts";

const testingLibrary = {
  specifier: "vitest-plugin-rsc/nextjs/testing-library",
  file: "/plugin/nextjs/index.js",
};

// The plugins, for a project whose host files are its test files and a setup
// file, and whose host has the packages of Vitest.
const isHostFile = (file: string) => /\.test\.tsx$|\/vitest\.setup\.tsx?$/.test(file);
// Vite RSC made the modules of these files client references: they have
// `"use client"`.
const references = new Set(["/app/frame.test.tsx", "/vitest.setup.tsx"]);
const isClientReference = (id: string) => references.has(id);
const plugin = clientFiles({
  environments: { rsc: "client", browser: "react_client" },
  testingLibrary,
  isHostFile,
  isHostPackage: (specifier) => /^vitest(\/|$)|^@vitest\//.test(specifier),
  isClientReference,
});
const entries = clientEntries({
  rsc: "client",
  internal: "/plugin/nextjs/internal.js",
  isHostFile,
  isSetupFile: (file) => /\/vitest\.setup\.tsx?$/.test(file),
  isClientReference,
});

type Resolved = { id: string } | null;
type Context = {
  environment: { name: string; config: { root: string }; getTopLevelConfig(): object };
  resolve(source: string, importer?: string): Promise<Resolved>;
  error(message: string): never;
};

// What Vite's own resolver would answer: a relative import is a file next to
// its importer, and everything else a package.
const context = (environment: string): Context => ({
  environment: { name: environment, config: { root: "/" }, getTopLevelConfig: () => ({}) },
  resolve: async (source, importer) => ({
    id: source.startsWith(".")
      ? new URL(source, `file://${importer}`).pathname
      : `/node_modules/${source}/index.js`,
  }),
  error(message) {
    throw new Error(message);
  },
});

const { handler: resolveId } = plugin.resolveId as unknown as {
  handler(
    this: Context,
    source: string,
    importer: string | undefined,
    options: object,
  ): Promise<Resolved | string | undefined>;
};
const load = plugin.load as unknown as (this: Context, id: string) => string | undefined;
const transform = plugin.transform as unknown as (
  this: Context,
  code: string,
  id: string,
) => Promise<{ code: string } | undefined>;
const transformEntry = entries.transform as unknown as (
  this: Context,
  code: string,
  id: string,
) => { code: string } | undefined;

const resolve = (source: string, importer?: string, environment = "react_client", options = {}) =>
  resolveId.call(context(environment), source, importer, options);

// What Vite RSC made of a file with `"use client"` in the rsc layer: a
// reference for each export, and none of the code of the file.
const reference = `import * as $$ReactServer from "@vitejs/plugin-rsc/react/rsc/server";
export const Frame = /* #__PURE__ */ $$ReactServer.registerClientReference(() => {}, "/app/frame.test.tsx", "Frame");
`;

test("has the module of a file with `use client` of the host load the file in the browser layer first", () => {
  // After Vite RSC made the reference.
  expect(entries.enforce).toBe("post");

  const entry = transformEntry.call(context("client"), reference, "/app/frame.test.tsx");

  // On the first line, before what is there: the lines keep their numbers.
  expect(entry?.code).toBe(
    `import { loadClientEntry as __vitestPluginRscLoadClientEntry } from "/plugin/nextjs/internal.js"; ` +
      `await __vitestPluginRscLoadClientEntry("/app/frame.test.tsx"); ` +
      reference,
  );
  expect(entry?.code.split("\n")).toHaveLength(reference.split("\n").length);
  // A setup file with the directive too.
  expect(transformEntry.call(context("client"), reference, "/vitest.setup.tsx")?.code).toContain(
    `__vitestPluginRscLoadClientEntry("/vitest.setup.tsx")`,
  );
});

test("has the module of a setup file without the directive load the files with it that it imports", () => {
  const setup = `import { vi } from "vitest";\nimport "./setup.client.tsx";\nvi.mock("./db.ts");\n`;

  const entry = transformEntry.call(context("client"), setup, "/vitest.setup.ts");

  expect(entry?.code).toBe(
    `import { loadClientEntry as __vitestPluginRscLoadClientEntry } from "/plugin/nextjs/internal.js"; ` +
      `await __vitestPluginRscLoadClientEntry("/vitest.setup.ts"); ` +
      setup,
  );
});

test("leaves a test file without the directive as it is, and a file that is not the host's", () => {
  const rsc = context("client");
  const server = `import { test } from "vitest";\nimport { Frame } from "./frame.tsx";\ntest("renders", () => {});\n`;

  // Its components render with `renderServer()`, in a page of their own.
  expect(transformEntry.call(rsc, server, "/app/a.test.tsx")).toBeUndefined();
  // A file of the app with the directive, and a file of the host in another layer.
  expect(transformEntry.call(rsc, reference, "/app/counter.tsx")).toBeUndefined();
  expect(
    transformEntry.call(context("react_client"), reference, "/app/frame.test.tsx"),
  ).toBeUndefined();
  // Not a file with a query, like Vite's `?import`, which the browser asks for.
  expect(transformEntry.call(rsc, reference, "/app/frame.test.tsx?import")).toBeUndefined();
});

test("leaves the code of a file with the directive to Vite RSC, which makes it a reference", async () => {
  const code = `"use client";
import { test } from "vitest";
import type { ReactNode } from "react";
import { Counter } from "./counter.tsx";

type Props = { children: ReactNode };
export const Primary = { args: { label: "Go" } satisfies Record<string, string> };
export function Frame({ children }: Props) { return <div>{children}<Counter /></div>; }
export * from "./stories.tsx";
test("renders", () => {});
`;

  expect(await transform.call(context("client"), code, "/app/frame.test.tsx")).toBeUndefined();
  expect(await transform.call(context("client"), code, "/app/counter.tsx")).toBeUndefined();
  expect(await transform.call(context("react_client"), code, "/app/a.test.tsx")).toBeUndefined();
});

test("says so for a client file that mocks a module, which the mocker of its `vi` cannot", async () => {
  const rsc = context("client");
  const file = (body: string) => `"use client";\nimport { vi } from "vitest";\n${body}\n`;

  await expect(
    transform.call(rsc, file(`vi.mock("./counter.tsx");`), "/app/a.test.tsx"),
  ).rejects.toThrow('/app/a.test.tsx calls vi.mock(), which a file with "use client" cannot');
  for (const name of ["unmock", "doMock", "doUnmock"]) {
    await expect(
      transform.call(rsc, file(`vi.${name}("./counter.tsx");`), "/app/a.test.tsx"),
    ).rejects.toThrow(`calls vi.${name}()`);
  }
  await expect(
    transform.call(rsc, file(`const spy = vi.hoisted(() => vi.fn());`), "/app/a.test.tsx"),
  ).rejects.toThrow("calls vi.hoisted()");
  // A spy is fine, and so is a comment that names one.
  const spy = file(`// vi.mock("./counter.tsx")\nexport const onClick = vi.fn();`);
  await expect(transform.call(rsc, spy, "/app/a.test.tsx")).resolves.toBeUndefined();
});

test("gives the browser layer the page's own module for a package of the host", async () => {
  const importer = "/app/counter.tsx";

  expect(await resolve("vitest", importer)).toBe(`${hostModulePrefix}vitest`);
  expect(await resolve("vitest/browser", importer)).toBe(`${hostModulePrefix}vitest/browser`);
  expect(await resolve("@vitest/spy", importer)).toBe(`${hostModulePrefix}@vitest/spy`);
  expect(await resolve(testingLibrary.specifier, importer)).toBe(
    hostModulePrefix + testingLibrary.specifier,
  );
  // Not a package that only starts with the name, and not in the rsc layer.
  expect(await resolve("vitest-browser-react", importer)).toBeUndefined();
  expect(await resolve("vitest", importer, "client")).toBeUndefined();
  // What the page asks the layer for itself is the layer's.
  expect(await resolve("vitest", undefined)).toBeUndefined();
  expect(await resolve("vitest", "/index.html")).toBeUndefined();
});

test("gives a file of the host the page's own module for another file of the host", async () => {
  expect(await resolve("../vitest.setup.ts", "/app/a.test.tsx")).toBe(
    `${hostModulePrefix}/vitest.setup.ts`,
  );
  // Not for one with `"use client"`: that is the browser layer's own, as any
  // file with the directive.
  expect(await resolve("../vitest.setup.tsx", "/app/a.test.tsx")).toEqual({
    id: "/vitest.setup.tsx",
  });
  expect(await resolve("./frame.test.tsx", "/app/a.test.tsx")).toEqual({
    id: "/app/frame.test.tsx",
  });
  // A file of the app is the browser layer's, and so is what it imports.
  expect(await resolve("../vitest.setup.ts", "/app/counter.tsx")).toBeUndefined();
  expect(await resolve("./counter.tsx", "/app/page.tsx")).toBeUndefined();
});

test("leaves every other import of a file of the host to the browser layer", async () => {
  const importer = "/app/a.test.tsx";

  expect(await resolve("react", importer)).toEqual({ id: "/node_modules/react/index.js" });
  expect(await resolve("./counter.tsx", importer)).toEqual({ id: "/app/counter.tsx" });
  expect(await resolve("vitest-browser-react", importer)).toEqual({
    id: "/node_modules/vitest-browser-react/index.js",
  });
});

test("serves a module of the host to the page as the module it stands for", () => {
  const rsc = context("client");

  expect(load.call(rsc, `${hostModulePrefix}vitest`)).toBe(
    `import * as module from "vitest";\nexport default module;\n`,
  );
  // A client file renders no server code.
  expect(load.call(rsc, hostModulePrefix + testingLibrary.specifier)).toBe(
    `import * as module from "/plugin/nextjs/index.js";\n` +
      `export default {\n` +
      `  ...module,\n` +
      `  async renderServer() {\n` +
      `    throw new Error(${JSON.stringify(renderServerError)});\n` +
      `  },\n` +
      `};\n`,
  );
  expect(load.call(rsc, "/app/counter.tsx")).toBeUndefined();
});

test("tells a module of the host apart as a module runner spells it", () => {
  expect(isHostModule("/@id/__x00__vitest-plugin-rsc/host-module/vitest")).toBe(true);
  expect(isHostModule("/@id/vitest")).toBe(false);
});
