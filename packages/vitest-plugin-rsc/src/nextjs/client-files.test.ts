import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { normalizePath, type Plugin } from "vite";
import { afterAll, expect, test } from "vitest";
import { builtHostModuleUrl, hostModulePrefix, isHostModule } from "../host-module.ts";
import {
  clientFiles,
  clientReferenceOfModule,
  fileOfModule,
  hostFileSpecifier,
  renderServerError,
} from "./client-files.ts";

const testingLibrary = {
  specifier: "vitest-plugin-rsc/nextjs/testing-library",
  file: "/plugin/nextjs/index.js",
};

// The plugins, for a project whose host files are its test files, a setup
// file, the files of a framework in `node_modules` and the `.mdx` files of
// `docs/`, and whose host has the packages of Vitest.
const framework = "/node_modules/framework/dist";
const isHostFile = (file: string) =>
  /\.test\.tsx$|\/vitest\.setup\.tsx?$|^\/docs\/.*\.mdx$/.test(file) ||
  file.startsWith(`${framework}/`);
// Vite RSC made the modules of these files client references: they have
// `"use client"`. The URL of a file of the project in the browser layer is
// its path. One of a dependency is a module of Vite RSC that imports it: by
// its file, which Vite RSC has the reference by, without Vite's version, or
// by the name of its package, when the page imports it by that, with the
// reference by the id.
const proxy = "/@id/__x00__virtual:vite-rsc/";
const references: Record<string, string> = {
  "/app/frame.test.tsx": "/app/frame.test.tsx",
  "/vitest.setup.tsx": "/vitest.setup.tsx",
  "/app/built.test.tsx": "/app/built.test.tsx",
  "/docs/intro.mdx": "/docs/intro.mdx",
  [`${framework}/client-story.js`]: `${proxy}client-in-server-package-proxy/${encodeURIComponent(`${framework}/client-story.js`)}`,
  [`${framework}/by-name.js?v=1a2b3c4d`]: `${proxy}client-package-proxy/framework/by-name`,
};
// The key that the references of a module have in their `$$id`: with a dev
// server the URL, in a build a hash of the file. This file has the key of a
// build.
const builtKeys = new Map([["/app/built.test.tsx", "5f3a9c1e"]]);
const clientReferenceOf = (id: string) => {
  const url = clientReferenceOfModule(references, id);
  if (url === undefined) return;
  return { referenceKey: builtKeys.get(id) ?? url };
};
const [plugin, loaders] = clientFiles({
  environments: { rsc: "client", browser: "react_client" },
  testingLibrary,
  internal: "/plugin/nextjs/internal.js",
  isHostFile,
  isHostPackage: (specifier) => /^vitest(\/|$)|^@vitest\//.test(specifier),
  clientReferenceOf,
}) as [Plugin, Plugin];

type Resolved = { id: string; external?: boolean | "absolute" };
type Context = {
  environment: {
    name: string;
    mode: "dev" | "build";
    config: { root: string };
    getTopLevelConfig(): { root: string };
  };
  error(message: string): never;
  resolve(source: string, importer: string): Promise<Resolved | null>;
};

// An environment of a dev server, or of a build, of the project at `root`.
// Its resolvers find a relative import from the importer, and a package in
// `node_modules`.
const context = (environment: string, mode: "dev" | "build" = "dev", root = "/"): Context => ({
  environment: {
    name: environment,
    mode,
    config: { root },
    getTopLevelConfig: () => ({ root }),
  },
  error(message) {
    throw new Error(message);
  },
  resolve: async (source, importer) => ({
    id: source.startsWith(".")
      ? path.posix.join(path.posix.dirname(importer), source)
      : `${root.replace(/\/$/, "")}/node_modules/${source}/index.js`,
  }),
});

const { handler: resolveId } = plugin.resolveId as unknown as {
  handler(
    this: Context,
    source: string,
    importer: string | undefined,
    options: object,
  ): Promise<string | Resolved | null | undefined>;
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

const resolve = (
  source: string,
  importer?: string,
  environment = "react_client",
  mode: "dev" | "build" = "dev",
  root = "/",
) => resolveId.call(context(environment, mode, root), source, importer, {});

// What Vite RSC made of a file with `"use client"` in the rsc layer: a
// reference for each export, and none of the code of the file.
const reference = `import * as $$ReactServer from "@vitejs/plugin-rsc/react/rsc/server";
export const Frame = /* #__PURE__ */ $$ReactServer.registerClientReference(() => {}, "/app/frame.test.tsx", "Frame");
`;

test("has the module of a file with `use client` of the host load the file in the browser layer first", () => {
  // After Vite RSC made the reference.
  expect(loaders.enforce).toBe("post");

  const loader = transformLoader.call(context("client"), reference, "/app/frame.test.tsx");

  // In front of the reference module, by the key of its references, which
  // with a dev server is the URL of the file in the browser layer.
  expect(loader?.code).toBe(
    `import { loadClientFile as __vitestPluginRscLoadClientFile } from "/plugin/nextjs/internal.js"; ` +
      `await __vitestPluginRscLoadClientFile("/app/frame.test.tsx"); ` +
      reference,
  );
  // A setup file with the directive too.
  expect(transformLoader.call(context("client"), reference, "/vitest.setup.tsx")?.code).toContain(
    `__vitestPluginRscLoadClientFile("/vitest.setup.tsx")`,
  );
});

test("loads a file of the host in a build by its key, with the key of its stylesheets", () => {
  const loader = transformLoader.call(context("client", "build"), reference, "/app/built.test.tsx");

  // The key of a build, a hash, which the file's evaluation is recorded by,
  // and its path from the root of the project, by which the build has its
  // stylesheets: not its id, which is a path of the machine.
  expect(loader?.code).toContain(
    `__vitestPluginRscLoadClientFile("5f3a9c1e", "app/built.test.tsx")`,
  );
  expect(loader?.code).not.toContain("/app/built.test.tsx");
});

test("leaves a file without the directive as it is, and a file that is not the host's", () => {
  const rsc = context("client");
  const server = `import { test } from "vitest";\nimport { Frame } from "./frame.tsx";\ntest("renders", () => {});\n`;
  const setup = `import { vi } from "vitest";\nimport "./setup.client.tsx";\nvi.mock("./db.ts");\n`;

  // Its components render with `renderServer()`, in a page of their own.
  expect(transformLoader.call(rsc, server, "/app/a.test.tsx")).toBeUndefined();
  // A setup file without the directive is server code: what it imports with
  // the directive is a reference, as in React.
  expect(transformLoader.call(rsc, setup, "/vitest.setup.ts")).toBeUndefined();
  // A file of the app with the directive, and a file of the host in another layer.
  expect(transformLoader.call(rsc, reference, "/app/counter.tsx")).toBeUndefined();
  expect(
    transformLoader.call(context("react_client"), reference, "/app/frame.test.tsx"),
  ).toBeUndefined();
  // Not a file with a query, like Vite's `?import`, which the browser asks for.
  expect(transformLoader.call(rsc, reference, "/app/frame.test.tsx?import")).toBeUndefined();
});

test("loads a file of the host with another extension, whose code a plugin of the host compiled", async () => {
  const rsc = context("client");

  // Vite RSC made a reference of it: its compiled code has the directive.
  expect(transformLoader.call(rsc, reference, "/docs/intro.mdx")?.code).toContain(
    `__vitestPluginRscLoadClientFile("/docs/intro.mdx"); `,
  );
  expect(
    transformLoader.call(context("client", "build"), reference, "/docs/intro.mdx")?.code,
  ).toContain(`__vitestPluginRscLoadClientFile("/docs/intro.mdx", "docs/intro.mdx"); `);
  // One without the directive is no client file: Vite RSC made no reference of it.
  const page = `export default function Content() { return <h1>Notes</h1>; }\n`;
  expect(transformLoader.call(rsc, page, "/docs/notes.mdx")).toBeUndefined();
  // The extension alone makes no file the host's.
  expect(transformLoader.call(rsc, reference, "/app/readme.mdx")).toBeUndefined();

  // The check of `vi.mock()` parses no code that the host has yet to compile.
  const source = `# Use "use client"\n\nWith the directive, a file runs in the browser.\n`;
  await expect(transform.call(rsc, source, "/docs/intro.mdx")).resolves.toBeUndefined();
});

test("takes the id of a module for its file, without the version of a dependency", () => {
  expect(fileOfModule("/app/a.test.tsx")).toBe("/app/a.test.tsx");
  expect(fileOfModule("/x/node_modules/a/b.js?v=1a2b3c4d")).toBe("/x/node_modules/a/b.js");
  expect(fileOfModule("/x/node_modules/a/b.js?v=1.2.3-beta_4")).toBe("/x/node_modules/a/b.js");
  // Another module of the file.
  for (const query of ["import", "raw", "url", "v=1a2b3c4d&raw", "raw&v=1a2b", "v="]) {
    expect(fileOfModule(`/x/node_modules/a/b.js?${query}`), query).toBeUndefined();
  }
});

test("finds the client reference of a module by its id, else by its file", () => {
  const map = { "/a.js": "by file", "/b.js?v=1a2b": "by id", "/b.js": "by file" };
  expect(clientReferenceOfModule(map, "/a.js")).toBe("by file");
  expect(clientReferenceOfModule(map, "/a.js?v=1a2b")).toBe("by file");
  expect(clientReferenceOfModule(map, "/b.js?v=1a2b")).toBe("by id");
  // Another module of the file is not the reference.
  expect(clientReferenceOfModule(map, "/a.js?raw")).toBeUndefined();
  expect(clientReferenceOfModule(map, "/c.js")).toBeUndefined();
});

test("loads a file of the host in `node_modules` that has Vite's version query", async () => {
  const rsc = context("client");
  const load = (id: string) => transformLoader.call(rsc, reference, id)?.code;
  const storyProxy = references[`${framework}/client-story.js`];
  const byName = `${proxy}client-package-proxy/framework/by-name`;

  // By the reference that Vite RSC has by the file.
  expect(load(`${framework}/client-story.js?v=1a2b3c4d`)).toContain(
    `__vitestPluginRscLoadClientFile("${storyProxy}")`,
  );
  // And by the one it has by the id.
  expect(load(`${framework}/by-name.js?v=1a2b3c4d`)).toContain(
    `__vitestPluginRscLoadClientFile("${byName}")`,
  );
  // Not another module of the file.
  for (const query of ["raw", "v=1a2b3c4d&raw"]) {
    expect(load(`${framework}/client-story.js?${query}`), query).toBeUndefined();
  }
  // And it says so for a mock in one, too.
  const mocking = `"use client";\nimport { vi } from "vitest";\nvi.mock("./a.js");\n`;
  await expect(
    transform.call(rsc, mocking, `${framework}/client-story.js?v=1a2b3c4d`),
  ).rejects.toThrow(`${framework}/client-story.js calls vi.mock()`);
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
  expect(await resolve("vitest-browser-react", importer)).toEqual({
    id: "/node_modules/vitest-browser-react/index.js",
  });
  expect(await resolve("vitest", importer, "client")).toBeUndefined();
  // What the page asks the layer for itself is the layer's.
  expect(await resolve("vitest", undefined)).toBeUndefined();
  expect(await resolve("vitest", "/index.html")).toBeUndefined();
});

test("has a build of the browser layer import the page's own module by its URL", async () => {
  // The rsc layer, the host's build, has it: see `hostModulesId`.
  const url = "/@id/__x00__vitest-plugin-rsc/host-module/@vitest/spy";
  expect(await resolve("@vitest/spy", "/app/counter.tsx", "react_client", "build")).toEqual({
    id: url,
    external: "absolute",
  });
  expect(isHostModule(url)).toBe(true);
  // Which loads the module as the host's build has it.
  expect(await resolve(`${hostModulePrefix}@vitest/spy`, undefined, "client", "build")).toBe(
    `${hostModulePrefix}@vitest/spy`,
  );
});

// A project on disk, whose files the plugin reads for their directive: test
// files with `"use client"`, with `"use server"` and without, a setup file
// without, a file of the app, an MDX file of the host, and a file of the host
// outside the root.
const project = normalizePath(fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "files-"))));
const root = `${project}/root`;
const files: Record<string, string> = {
  "root/app/a.test.tsx": `"use client";\nimport "./b.test.tsx";\n`,
  "root/app/frame.test.tsx": `"use client";\n\nexport const Frame = () => null;\n`,
  "root/app/b.test.tsx": `// "use client" only in a comment\nexport const data = {};\n`,
  "root/vitest.setup.ts": `export {};\n`,
  "root/app/actions.test.ts": `"use server";\n\nexport async function save() {}\n`,
  "root/app/counter.tsx": `export const Counter = () => null;\n`,
  "root/docs/intro.mdx": `# Intro\n`,
  "shared/c.test.tsx": `export const data = {};\n`,
};
for (const [file, code] of Object.entries(files)) {
  fs.mkdirSync(path.dirname(`${project}/${file}`), { recursive: true });
  fs.writeFileSync(`${project}/${file}`, code);
}
afterAll(() => fs.rmSync(project, { recursive: true, force: true }));

test("gives the browser layer the page's own module for a file of the host without the directive", async () => {
  const importer = `${root}/app/a.test.tsx`;

  // Server code, evaluated once, by the page: the layer gets that instance,
  // by the file's path from the root.
  expect(await resolve("./b.test.tsx", importer, "react_client", "dev", root)).toBe(
    `${hostModulePrefix}/app/b.test.tsx?host-file`,
  );
  expect(await resolve("../vitest.setup.ts", importer, "react_client", "dev", root)).toBe(
    `${hostModulePrefix}/vitest.setup.ts?host-file`,
  );
  // A build imports it by its URL, as a package of the host.
  const url = builtHostModuleUrl("/app/b.test.tsx?host-file");
  expect(await resolve("./b.test.tsx", importer, "react_client", "build", root)).toEqual({
    id: url,
    external: "absolute",
  });
  expect(url).toBe("/@id/__x00__vitest-plugin-rsc/host-module//app/b.test.tsx?host-file");
  expect(isHostModule(url)).toBe(true);
  // Outside the root: by Vite's `/@fs/` with a dev server, which a browser
  // does not resolve the `..` of, and in a build by the path from the root.
  expect(await resolve("../../shared/c.test.tsx", importer, "react_client", "dev", root)).toBe(
    `${hostModulePrefix}/@fs${project}/shared/c.test.tsx?host-file`,
  );
  expect(await resolve("../../shared/c.test.tsx", importer, "react_client", "build", root)).toEqual(
    {
      id: builtHostModuleUrl("/../shared/c.test.tsx?host-file"),
      external: "absolute",
    },
  );
});

test("leaves every other import of the browser layer to the layer", async () => {
  const importer = `${root}/app/a.test.tsx`;
  const browser = (source: string) => resolve(source, importer, "react_client", "dev", root);

  // A file of the host with the directive: the browser layer's, as what a
  // client module imports is client code in React.
  expect(await browser("./frame.test.tsx")).toEqual({ id: `${root}/app/frame.test.tsx` });
  // One with `"use server"`: the layer has its functions as Server Actions.
  expect(await browser("./actions.test.ts")).toEqual({ id: `${root}/app/actions.test.ts` });
  // A file of the app, a package, and a file of the host that is not
  // JavaScript, like an MDX file or a stylesheet.
  expect(await browser("./counter.tsx")).toEqual({ id: `${root}/app/counter.tsx` });
  expect(await browser("react")).toEqual({ id: `${root}/node_modules/react/index.js` });
  expect(await browser("../docs/intro.mdx")).toEqual({ id: `${root}/docs/intro.mdx` });
  // Another module of the file than its code, and a file that is not there.
  expect(await browser("./b.test.tsx?raw")).toEqual({ id: `${root}/app/b.test.tsx?raw` });
  expect(await browser("./gone.test.tsx")).toEqual({ id: `${root}/app/gone.test.tsx` });
});

test("names a file of the host by its path from the root", () => {
  expect(hostFileSpecifier("/root/host/shared.ts", "/root", false)).toBe(
    "/host/shared.ts?host-file",
  );
  expect(hostFileSpecifier("/root/host/shared.ts", "/root", true)).toBe(
    "/host/shared.ts?host-file",
  );
  expect(hostFileSpecifier("/other/shared.ts", "/root", false)).toBe(
    "/@fs/other/shared.ts?host-file",
  );
  expect(hostFileSpecifier("/other/shared.ts", "/root", true)).toBe(
    "/../other/shared.ts?host-file",
  );
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
  // A file of the host, by its path, which is the module that the page
  // imports.
  expect(
    load.call(context("client", "dev", "/root"), `${hostModulePrefix}/host/shared.ts?host-file`),
  ).toBe(`import * as module from "/root/host/shared.ts";\nexport default module;\n`);
  expect(
    load.call(
      context("client", "dev", "/root"),
      `${hostModulePrefix}/@fs/other/shared.ts?host-file`,
    ),
  ).toBe(`import * as module from "/other/shared.ts";\nexport default module;\n`);
  expect(
    load.call(
      context("client", "build", "/root"),
      `${hostModulePrefix}/../other/shared.ts?host-file`,
    ),
  ).toBe(`import * as module from "/other/shared.ts";\nexport default module;\n`);
});

test("tells a module of the host apart as a module runner spells it", () => {
  expect(isHostModule("/@id/__x00__vitest-plugin-rsc/host-module/vitest")).toBe(true);
  expect(isHostModule("/@id/vitest")).toBe(false);
});
