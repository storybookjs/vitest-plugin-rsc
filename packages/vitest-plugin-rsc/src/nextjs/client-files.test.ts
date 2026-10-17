import type { Plugin } from "vite";
import { expect, test } from "vitest";
import { hostModulePrefix, isHostModule } from "../host-module.ts";
import { clientFiles, renderServerError } from "./client-files.ts";

const testingLibrary = {
  specifier: "vitest-plugin-rsc/nextjs/testing-library",
  file: "/plugin/nextjs/index.js",
};

// The plugins, for a project whose host files are its test files and a setup
// file, and whose host has the packages of Vitest.
const isHostFile = (file: string) => /\.test\.tsx$|\/vitest\.setup\.tsx?$/.test(file);
// Vite RSC made the modules of these files client references: they have
// `"use client"`. Their URL in the browser layer is their path.
const references = new Set(["/app/frame.test.tsx", "/vitest.setup.tsx"]);
const clientReferenceOf = (id: string) => (references.has(id) ? { importId: id } : undefined);
const [plugin, loaders] = clientFiles({
  environments: { rsc: "client", browser: "react_client" },
  testingLibrary,
  internal: "/plugin/nextjs/internal.js",
  isHostFile,
  isHostPackage: (specifier) => /^vitest(\/|$)|^@vitest\//.test(specifier),
  clientReferenceOf,
}) as [Plugin, Plugin];

type Context = {
  environment: { name: string; config: { root: string }; getTopLevelConfig(): object };
  error(message: string): never;
};

const context = (environment: string): Context => ({
  environment: { name: environment, config: { root: "/" }, getTopLevelConfig: () => ({}) },
  error(message) {
    throw new Error(message);
  },
});

const { handler: resolveId } = plugin.resolveId as unknown as {
  handler(this: Context, source: string, importer: string | undefined): string | undefined;
};
const load = plugin.load as unknown as (this: Context, id: string) => string | undefined;
const transform = plugin.transform as unknown as (
  this: Context,
  code: string,
  id: string,
) => Promise<{ code: string } | undefined>;
const transformLoader = loaders.transform as unknown as (
  this: Context,
  code: string,
  id: string,
) => { code: string } | undefined;

const resolve = (source: string, importer?: string, environment = "react_client") =>
  resolveId.call(context(environment), source, importer);

// What Vite RSC made of a file with `"use client"` in the rsc layer: a
// reference for each export, and none of the code of the file.
const reference = `import * as $$ReactServer from "@vitejs/plugin-rsc/react/rsc/server";
export const Frame = /* #__PURE__ */ $$ReactServer.registerClientReference(() => {}, "/app/frame.test.tsx", "Frame");
`;

// What the plugin puts in front of every file of the host in the rsc layer:
// the file says that it loaded, see `hostFiles` in registry.ts.
const loaded = (file: string) =>
  `import { loadedHostFile as __vitestPluginRscLoadedHostFile } from "/plugin/nextjs/internal.js"; ` +
  `__vitestPluginRscLoadedHostFile(${JSON.stringify(file)}); `;

test("has the module of a file with `use client` of the host load the file in the browser layer first", () => {
  // After Vite RSC made the reference.
  expect(loaders.enforce).toBe("post");

  const loader = transformLoader.call(context("client"), reference, "/app/frame.test.tsx");

  // In front of the reference module, at the URL of the file in the browser
  // layer, after the line that says the file loaded.
  expect(loader?.code).toBe(
    loaded("/app/frame.test.tsx") +
      `import { loadClientFile as __vitestPluginRscLoadClientFile } from "/plugin/nextjs/internal.js"; ` +
      `await __vitestPluginRscLoadClientFile("/app/frame.test.tsx"); ` +
      reference,
  );
  // A setup file with the directive too.
  expect(transformLoader.call(context("client"), reference, "/vitest.setup.tsx")?.code).toContain(
    `__vitestPluginRscLoadClientFile("/vitest.setup.tsx")`,
  );
});

test("has a file of the host without the directive say that it loaded, and leaves the rest as it is", () => {
  const rsc = context("client");
  const server = `import { test } from "vitest";\nimport { Frame } from "./frame.tsx";\ntest("renders", () => {});\n`;
  const setup = `import { vi } from "vitest";\nimport "./setup.client.tsx";\nvi.mock("./db.ts");\n`;

  // Its components render with `renderServer()`, in a page of their own: the
  // node has the CSS of what the file imports, so the file says it loaded.
  // On the first line, with the code as it is after it.
  expect(transformLoader.call(rsc, server, "/app/a.test.tsx")).toEqual({
    code: loaded("/app/a.test.tsx") + server,
    map: null,
  });
  // A setup file without the directive is server code: what it imports with
  // the directive is a reference, as in React. It says it loaded, the same.
  expect(transformLoader.call(rsc, setup, "/vitest.setup.ts")?.code).toBe(
    loaded("/vitest.setup.ts") + setup,
  );
  // A file of the app with the directive, and a file of the host in another layer.
  expect(transformLoader.call(rsc, reference, "/app/counter.tsx")).toBeUndefined();
  expect(
    transformLoader.call(context("react_client"), reference, "/app/frame.test.tsx"),
  ).toBeUndefined();
  // Not a file with a query, like Vite's `?import`, which the browser asks for.
  expect(transformLoader.call(rsc, reference, "/app/frame.test.tsx?import")).toBeUndefined();
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

test("gives the browser layer the page's own module for a package of the host", () => {
  const importer = "/app/counter.tsx";

  expect(resolve("vitest", importer)).toBe(`${hostModulePrefix}vitest`);
  expect(resolve("vitest/browser", importer)).toBe(`${hostModulePrefix}vitest/browser`);
  expect(resolve("@vitest/spy", importer)).toBe(`${hostModulePrefix}@vitest/spy`);
  expect(resolve(testingLibrary.specifier, importer)).toBe(
    hostModulePrefix + testingLibrary.specifier,
  );
  // Not a package that only starts with the name, and not in the rsc layer.
  expect(resolve("vitest-browser-react", importer)).toBeUndefined();
  expect(resolve("vitest", importer, "client")).toBeUndefined();
  // What the page asks the layer for itself is the layer's.
  expect(resolve("vitest", undefined)).toBeUndefined();
  expect(resolve("vitest", "/index.html")).toBeUndefined();
});

test("leaves every other import of a file of the host to the browser layer", () => {
  const importer = "/app/a.test.tsx";

  expect(resolve("react", importer)).toBeUndefined();
  expect(resolve("./counter.tsx", importer)).toBeUndefined();
  expect(resolve("vitest-browser-react", importer)).toBeUndefined();
  // Also another file of the host, with the directive or without: what a
  // client module imports is client code, as in React.
  expect(resolve("./frame.test.tsx", importer)).toBeUndefined();
  expect(resolve("../vitest.setup.ts", importer)).toBeUndefined();
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
