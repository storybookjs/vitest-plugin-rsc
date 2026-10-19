import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createServer, type EnvironmentModuleNode, type Plugin } from "vite";
import { expect, onTestFinished, test, vi } from "vitest";
import { hostModulePrefix, isHostModule } from "../host-module.ts";
import {
  clientFiles,
  clientReferenceOfModule,
  fileOfModule,
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

type Context = {
  environment: {
    name: string;
    mode: "dev" | "build";
    config: { root: string };
    getTopLevelConfig(): { root: string };
  };
  error(message: string): never;
};

// An environment of a dev server, or of a build, of the project at `/`.
const context = (environment: string, mode: "dev" | "build" = "dev"): Context => ({
  environment: {
    name: environment,
    mode,
    config: { root: "/" },
    getTopLevelConfig: () => ({ root: "/" }),
  },
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

const resolve = (
  source: string,
  importer?: string,
  environment = "react_client",
  mode: "dev" | "build" = "dev",
) => resolveId.call(context(environment, mode), source, importer);

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

test("has a build of the browser layer import the page's own module by its URL", () => {
  // The rsc layer, the host's build, has it: see `hostModulesId`.
  const url = "/@id/__x00__vitest-plugin-rsc/host-module/@vitest/spy";
  expect(resolve("@vitest/spy", "/app/counter.tsx", "react_client", "build")).toEqual({
    id: url,
    external: "absolute",
  });
  expect(isHostModule(url)).toBe(true);
  // Which loads the module as the host's build has it.
  expect(resolve(`${hostModulePrefix}@vitest/spy`, undefined, "client", "build")).toBe(
    `${hostModulePrefix}@vitest/spy`,
  );
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

// A dev server of a project with a file of the host with `"use client"`,
// `host.tsx`, which imports `value.ts` and `value.css` in the browser layer,
// and an entry of the host that imports it in the rsc layer and takes a change
// of it in place, as a framework does that renders it again. The plugin of
// Vite RSC is a stand-in that makes the file a reference module.
async function serveHostFile() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "client-files-")));
  onTestFinished(() => fs.rmSync(root, { recursive: true, force: true }));
  const files = {
    "host.tsx": '"use client";\nimport "./value.css";\nexport { value } from "./value.ts";\n',
    "value.ts": 'export const value = "one";\n',
    "value.css": "p { color: red }\n",
    "main.ts": 'import "./host.tsx";\nimport.meta.hot?.accept("./host.tsx", () => {});\n',
    "internal.ts": "export async function loadClientFile() {}\n",
  };
  for (const [name, code] of Object.entries(files)) fs.writeFileSync(path.join(root, name), code);
  const at = (name: string) => path.join(root, name);

  // The modules of the rsc layer that Vite takes a change of a file to, once
  // the plugins have said which.
  const changes = new Map<string, PromiseWithResolvers<string[]>>();
  const changeOf = (file: string) => {
    if (!changes.has(file)) changes.set(file, Promise.withResolvers());
    return changes.get(file)!;
  };
  const [own, loaders] = clientFiles({
    environments: { rsc: "client", browser: "react_client" },
    testingLibrary,
    internal: at("internal.ts"),
    isHostFile: (file) => file === at("host.tsx"),
    isHostPackage: () => false,
    clientReferenceOf: (id) => (id === at("host.tsx") ? { referenceKey: "/host.tsx" } : undefined),
  });
  const server = await createServer({
    root,
    configFile: false,
    logLevel: "silent",
    server: { middlewareMode: true, ws: false },
    environments: { client: {}, react_client: { consumer: "client" } },
    plugins: [
      own!,
      {
        name: "vite-rsc-stand-in",
        transform(_, id) {
          if (this.environment.name === "client" && id === at("host.tsx")) {
            return 'export const value = { $$id: "/host.tsx#value" };\n';
          }
        },
      },
      loaders!,
      {
        name: "changes",
        hotUpdate: {
          order: "post",
          handler({ file, modules }: { file: string; modules: EnvironmentModuleNode[] }) {
            if (this.environment.name !== "client") return;
            changeOf(file).resolve(modules.map(({ url }) => url));
          },
        },
      },
    ],
  });
  onTestFinished(() => server.close());
  // What the rsc layer sends the page: an update, by the module that takes it.
  const rsc = server.environments.client!;
  let sent = Promise.withResolvers<unknown>();
  vi.spyOn(rsc.hot, "send").mockImplementation((payload: unknown) => sent.resolve(payload));
  // What the page has loaded: the entry of the host in the rsc layer, and
  // the file in the graph of the browser layer.
  await rsc.transformRequest("/main.ts");
  await rsc.transformRequest("/host.tsx");
  for (const name of ["/host.tsx", "/value.ts", "/value.css"]) {
    await server.environments.react_client!.transformRequest(name);
  }

  return {
    hostModule: () => rsc.moduleGraph.getModuleById(at("host.tsx"))!,
    /**
     * Changes a file. `modules`: the ones of the rsc layer that Vite takes
     * the change to, once the plugins have said which. `sent`: what the rsc
     * layer sends the page next.
     */
    change(name: string, code: string) {
      sent = Promise.withResolvers();
      fs.writeFileSync(at(name), code);
      return { modules: changeOf(at(name)).promise, sent: sent.promise };
    },
  };
}

test("takes a change of what a file of the host imports in the browser layer to the host as a change of the file", async () => {
  const { hostModule, change } = await serveHostFile();
  expect(hostModule().transformResult).not.toBeNull();

  // The module of the file in the rsc layer imports nothing of `value.ts`.
  const { modules, sent } = change("value.ts", 'export const value = "two";\n');
  expect(await modules).toEqual(["/host.tsx"]);

  // The host imports the file again, whose new module loads the file again.
  expect(await sent).toEqual({
    type: "update",
    updates: [expect.objectContaining({ path: "/main.ts", acceptedPath: "/host.tsx" })],
  });
  expect(hostModule().transformResult).toBeNull();
});

test("takes a change of the file itself to the host once", async () => {
  const { change } = await serveHostFile();

  const { modules, sent } = change("host.tsx", '"use client";\nexport const value = "changed";\n');
  expect(await modules).toEqual(["/host.tsx"]);
  expect(await sent).toEqual({ type: "update", updates: [expect.anything()] });
});

test("leaves a stylesheet that a file of the host imports to change in place", async () => {
  const { change } = await serveHostFile();

  // No module of the rsc layer, so Vite sends that layer's page nothing.
  expect(await change("value.css", "p { color: green }\n").modules).toEqual([]);
});
