import { describe, expect, test, vi } from "vitest";
import { hostModuleId, isHostModule } from "../host-module.ts";
import {
  builtClientFileId,
  builtHostModuleUrl,
  builtLiveModuleId,
  createHostReferences,
} from "./build.ts";
import { clientFiles } from "./client-files.ts";
import { clientFileId, fileOfModule, isLiveModule, liveModulePrefix } from "./client-ids.ts";

const testingLibrary = {
  specifier: "vitest-plugin-rsc/nextjs/testing-library",
  file: "/plugin/nextjs/index.js",
};

// The plugin, for a project whose host files are its test files and a setup
// file, and whose host has `vitest` and the packages of Storybook.
const built = createHostReferences();
const plugin = clientFiles({
  environments: { rsc: "client", browser: "react_client" },
  testingLibrary,
  internal: "/plugin/nextjs/internal.js",
  isHostFile: (file) => /\.test\.tsx$|\/vitest\.setup\.ts$/.test(file),
  isHostPackage: (specifier) => /^(vitest|storybook)(\/|$)|^@storybook\//.test(specifier),
  built,
});

type Resolved = { id: string } | null;
type Context = {
  environment: { name: string; mode: "dev" | "build"; config: { root: string } };
  resolve(source: string, importer?: string): Promise<Resolved>;
  addWatchFile(file: string): void;
  emitFile(file: object): string;
  error(message: string): never;
};

// What Vite's own resolver would answer: a relative import is a file next to
// its importer, and everything else a package.
const context = (environment: string, mode: "dev" | "build" = "dev"): Context => ({
  environment: { name: environment, mode, config: { root: "/" } },
  resolve: async (source, importer) => ({
    id: source.startsWith(".")
      ? new URL(source, `file://${importer}`).pathname
      : `/node_modules/${source}/index.js`,
  }),
  addWatchFile: vi.fn(),
  emitFile: vi.fn(() => "reference"),
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

const resolve = (source: string, importer?: string, environment = "react_client", options = {}) =>
  resolveId.call(context(environment), source, importer, options);

test("makes a file with `use client` of the host a stub in the rsc layer, with its exports", async () => {
  const rsc = context("client");
  const code = `"use client";
import { test } from "vitest";
import type { ReactNode } from "react";
import { Counter } from "./counter.tsx";

type Props = { children: ReactNode };
export const Primary = { args: { label: "Go" } satisfies Record<string, string> };
export function Frame({ children }: Props) { return <div>{children}<Counter /></div>; }
export default { title: "Frame" };
test("renders", () => {});
`;

  const stub = await transform.call(rsc, code, "/app/frame.test.tsx");

  expect(stub?.code)
    .toBe(`import { loadClientFile as $$loadClientFile } from "/plugin/nextjs/internal.js";
const $$file = await $$loadClientFile("/@fs/app/frame.test.tsx");
export const Primary = $$file["Primary"];
export const Frame = $$file["Frame"];
export default $$file.default;
`);
  // The host follows these to know when to run the file again.
  expect(rsc.addWatchFile).toHaveBeenCalledWith("/app/counter.tsx");
  expect(rsc.addWatchFile).not.toHaveBeenCalledWith("/node_modules/vitest/index.js");
});

test("leaves a file alone that is not the host's, that has no directive, or in another layer", async () => {
  const code = `"use client";\nexport const Counter = () => null;\n`;

  expect(await transform.call(context("client"), code, "/app/counter.tsx")).toBeUndefined();
  expect(await transform.call(context("react_client"), code, "/app/a.test.tsx")).toBeUndefined();
  // Only a comment says it.
  const server = `// not "use client"\nexport const answer = 42;\n`;
  expect(await transform.call(context("client"), server, "/app/a.test.tsx")).toBeUndefined();
});

test("says so for a client file that does not name what it exports", async () => {
  const code = `"use client";\nexport * from "./stories.tsx";\n`;

  await expect(transform.call(context("client"), code, "/app/a.test.tsx")).rejects.toThrow(
    'cannot tell what /app/a.test.tsx exports, which a file with "use client" has to say by name',
  );
});

test("says so for a client file that mocks a module, which Vitest would leave out", async () => {
  const rsc = context("client");
  const file = (body: string) => `"use client";\nimport { vi } from "vitest";\n${body}\n`;

  await expect(
    transform.call(rsc, file(`vi.mock("./counter.tsx");`), "/app/a.test.tsx"),
  ).rejects.toThrow('/app/a.test.tsx calls vi.mock(), which a file with "use client" cannot');
  await expect(
    transform.call(rsc, file(`const spy = vi.hoisted(() => vi.fn());`), "/app/a.test.tsx"),
  ).rejects.toThrow("calls vi.hoisted()");
  // A spy is fine, and so is a comment that names one.
  const spy = file(`// vi.mock("./counter.tsx")\nexport const onClick = vi.fn();`);
  expect(await transform.call(rsc, spy, "/app/a.test.tsx")).toBeDefined();
});

test("gives the browser layer the page's own module for a package of the host", async () => {
  const importer = "/app/counter.tsx";

  expect(await resolve("vitest", importer)).toBe(hostModuleId("vitest"));
  expect(await resolve("storybook/test", importer)).toBe(hostModuleId("storybook/test"));
  expect(await resolve(testingLibrary.specifier, importer)).toBe(
    hostModuleId(testingLibrary.specifier),
  );
  // Not a package that only starts with the name, and not in the rsc layer.
  expect(await resolve("vitest-browser-react", importer)).toBeUndefined();
  expect(await resolve("vitest", importer, "client")).toBeUndefined();
  // What the page asks the layer for itself is the layer's.
  expect(await resolve("@storybook/nextjs-vite-rsc/client-story", undefined)).toBeUndefined();
  expect(await resolve("@storybook/nextjs-vite-rsc/client-story", "/index.html")).toBeUndefined();
});

test("gives a file of the host the page's own module for another file of the host", async () => {
  expect(await resolve("../vitest.setup.ts", "/app/a.test.tsx")).toBe(
    hostModuleId("/vitest.setup.ts"),
  );
  // A file of the app is the browser layer's, and so is what it imports.
  expect(await resolve("../vitest.setup.ts", "/app/counter.tsx")).toBeUndefined();
  expect(await resolve("./counter.tsx", "/app/page.tsx")).toBeUndefined();
});

test("gives a file of the host a module in between for every other import", async () => {
  const importer = "/app/a.test.tsx";

  const react = (await resolve("react", importer)) as string;
  const counter = (await resolve("./counter.tsx", importer)) as string;

  expect(react.startsWith(liveModulePrefix)).toBe(true);
  expect(counter).not.toBe(react);
  expect(load.call(context("react_client"), counter)).toBe(
    `import * as module from "./counter.tsx";\nexport { module };\n`,
  );
  // That module imports what the file would, from where the file is.
  expect(await resolve("./counter.tsx", counter)).toEqual({ id: "/app/counter.tsx" });
  expect(await resolve("react", react)).toEqual({ id: "/node_modules/react/index.js" });
  // The scan of the dependencies finds what the file imports.
  expect(await resolve("react", importer, "react_client", { scan: true })).toBeUndefined();
});

test("serves a module of the host to the page as the module it stands for", () => {
  const rsc = context("client");

  expect(load.call(rsc, hostModuleId("storybook/test"))).toBe(
    `import * as module from "storybook/test";\nexport default module;\n`,
  );
  // In a client file, `renderServer()` renders a node of the browser layer.
  expect(load.call(rsc, hostModuleId(testingLibrary.specifier))).toBe(
    `import * as module from "/plugin/nextjs/index.js";\n` +
      `export default { ...module, renderServer: module.renderClient };\n`,
  );
  expect(load.call(rsc, "/app/counter.tsx")).toBeUndefined();
  // The id of a story file's module does not end in its name, which the CSF
  // plugin of Storybook would read from disk.
  expect(hostModuleId("/app/a.stories.tsx")).not.toMatch(/\.stories\.tsx$/);
  expect(load.call(rsc, hostModuleId("/app/a.stories.tsx"))).toBe(
    `import * as module from "/app/a.stories.tsx";\nexport default module;\n`,
  );
});

test("tells the ids apart as a module runner spells them", () => {
  expect(isHostModule("/@id/__x00__vitest-plugin-rsc/host-module/vitest")).toBe(true);
  expect(isHostModule("/@id/vitest")).toBe(false);
  expect(isLiveModule("/@id/__x00__vitest-plugin-rsc/live-module/WyJhIiwiYiJd")).toBe(true);
  expect(isLiveModule("/app/counter.tsx")).toBe(false);
  expect(clientFileId("/Users/me/app/a.test.tsx")).toBe("/@fs/Users/me/app/a.test.tsx");
  expect(clientFileId("C:/app/a.test.tsx")).toBe("/@fs/C:/app/a.test.tsx");
  // In a static build, a module in between is a file of the browser layer.
  expect(isLiveModule("/vitest-plugin-rsc/react_client/live-modules/react-0123456789.js")).toBe(
    true,
  );
  expect(isLiveModule("/vitest-plugin-rsc/react_client/assets/react-0123456789.js")).toBe(false);
});

test("in a build, has a client file loaded from the file the browser layer of the build has", async () => {
  const code = `"use client";\nexport const Primary = {};\n`;

  const stub = await transform.call(context("client", "build"), code, "/app/a.test.tsx");

  const id = builtClientFileId("/", "/app/a.test.tsx");
  expect(stub?.code).toContain(`await $$loadClientFile(${JSON.stringify(id)});`);
  expect(id).toMatch(/^\/vitest-plugin-rsc\/react_client\/client-files\/a\.test-[\w-]{10}\.js$/);
  // For the build of the browser layer, which has it there.
  expect(built.clientFiles.get("/app/a.test.tsx")).toBe(id);
});

test("in a build, imports what a client file imports from files of their own", async () => {
  const browser = context("react_client", "build");
  // A build of the layer starts with no module in between.
  (plugin.buildStart as (this: Context) => void).call(browser);
  const importer = "/app/a.test.tsx";
  const resolveInBuild = (source: string) => resolveId.call(browser, source, importer, {});

  // The page's module is in the build of the host, by a URL.
  expect(await resolveInBuild("storybook/test")).toEqual({
    id: "/@id/__x00__vitest-plugin-rsc/host-module/storybook/test",
    external: "absolute",
  });
  expect(built.hostModules.get(builtHostModuleUrl("/", "storybook/test"))).toBe("storybook/test");
  const setup = await resolveInBuild("../vitest.setup.ts");
  expect(setup).toEqual({ id: builtHostModuleUrl("/", "/vitest.setup.ts"), external: "absolute" });
  expect(built.hostModules.get((setup as { id: string }).id)).toBe("/vitest.setup.ts");

  // A module in between is a file of the browser layer, which the bundler
  // builds once, and the client file imports when it runs.
  const counter = builtLiveModuleId("/", importer, "./counter.tsx");
  expect(await resolveInBuild("./counter.tsx")).toEqual({ id: counter, external: "absolute" });
  expect(await resolveInBuild("./counter.tsx")).toEqual({ id: counter, external: "absolute" });
  expect(browser.emitFile).toHaveBeenCalledOnce();
  const [[chunk]] = vi.mocked(browser.emitFile).mock.calls as unknown as [[{ id: string }]];
  expect(chunk).toEqual({ type: "chunk", id: chunk.id, fileName: counter.slice(1) });
  // With `import()`, for which the build loads the CSS of what it imports.
  expect(load.call(browser, chunk.id)).toBe(
    `export const module = await import("./counter.tsx");\n`,
  );
  expect(isLiveModule(counter)).toBe(true);
});

test("in a build, gives a module of the app the page's own module for a package of the host", async () => {
  // Like a mock of a module that a Client Component imports, with a spy of
  // Storybook in it: with a dev server it is the page's module too.
  const browser = context("react_client", "build");

  expect(await resolveId.call(browser, "storybook/test", "/app/lib/session.mock.ts", {})).toEqual({
    id: "/@id/__x00__vitest-plugin-rsc/host-module/storybook/test",
    external: "absolute",
  });
  // The build of the host has it, for the browser layer to import.
  expect(built.hostModules.get(builtHostModuleUrl("/", "storybook/test"))).toBe("storybook/test");
});

test("only refers to a file of host.ui.files in the rsc layer, which a page does not load", async () => {
  // Like an MDX docs page of Storybook, as its compiler leaves it.
  const withDocs = clientFiles({
    environments: { rsc: "client", browser: "react_client" },
    testingLibrary,
    internal: "/plugin/nextjs/internal.js",
    isHostFile: (file) => file.endsWith(".mdx"),
    isHostUiFile: (file) => file.endsWith(".mdx"),
    isHostPackage: () => false,
    built: createHostReferences(),
  });
  const transformDocs = withDocs.transform as unknown as typeof transform;
  const code = `import { Meta } from "@storybook/addon-docs/blocks";
export const title = "Intro";
export default function MDXContent() { return null; }
`;

  const rsc = context("client");
  const resolveInRsc = vi.spyOn(rsc, "resolve");

  const stub = await transformDocs.call(rsc, code, "/stories/intro.mdx");

  // Vite would pre-bundle a package that the rsc layer resolves.
  expect(resolveInRsc).not.toHaveBeenCalled();
  expect(stub?.code)
    .toBe(`import { referToUiFile as $$referToUiFile } from "/plugin/nextjs/internal.js";
const $$file = $$referToUiFile("/@fs/stories/intro.mdx", ["title","default"]);
export const title = $$file["title"];
export default $$file.default;
`);
  // The browser layer compiles it as it is.
  expect(await transformDocs.call(context("react_client"), code, "/stories/intro.mdx")).toBe(
    undefined,
  );
});

test("takes the id of a module of a dependency for its file, without the version of a dev server", () => {
  expect(fileOfModule("/app/a.test.tsx")).toBe("/app/a.test.tsx");
  expect(fileOfModule("/x/node_modules/a/b.js?v=1a2b3c4d")).toBe("/x/node_modules/a/b.js");
  expect(fileOfModule("/x/node_modules/a/b.js?v=1.2.3-beta_4")).toBe("/x/node_modules/a/b.js");
  // Another module of the file.
  for (const query of ["raw", "url", "inline", "transform-only", "v=1a2b3c4d&raw", "raw&v=1a2b"]) {
    expect(fileOfModule(`/x/node_modules/a/b.js?${query}`), query).toBeUndefined();
  }
  expect(fileOfModule("/x/node_modules/a/b.js?v=")).toBeUndefined();
});

describe("a package of the host in node_modules, which a dev server gives Vite's version query", () => {
  // Like a framework of Storybook: its module that renders a client story,
  // and the file of its docs renderer, which is one of `host.ui.files`.
  const framework = "/node_modules/framework/dist";
  const withPackage = clientFiles({
    environments: { rsc: "client", browser: "react_client" },
    testingLibrary,
    internal: "/plugin/nextjs/internal.js",
    isHostFile: (file) => file.startsWith(`${framework}/`),
    isHostUiFile: (file) => file === `${framework}/docs-renderer.js`,
    isHostPackage: () => false,
    built: createHostReferences(),
  });
  const transformPackage = withPackage.transform as unknown as typeof transform;
  const resolvePackage = (withPackage.resolveId as unknown as { handler: typeof resolveId })
    .handler;
  const clientStory = `"use client";\nexport function ClientStory() { return null; }\n`;

  test("makes its file with `use client` a stub of the file", async () => {
    const stub = await transformPackage.call(
      context("client"),
      clientStory,
      `${framework}/client-story.js?v=1a2b3c4d`,
    );

    const id = clientFileId(`${framework}/client-story.js`);
    expect(stub?.code).toContain(`await $$loadClientFile(${JSON.stringify(id)});`);
  });

  test("only refers to its file of host.ui.files", async () => {
    const code = `export async function createDocsRenderer() {}\n`;

    const stub = await transformPackage.call(
      context("client"),
      code,
      `${framework}/docs-renderer.js?v=1a2b3c4d`,
    );

    const id = clientFileId(`${framework}/docs-renderer.js`);
    expect(stub?.code).toContain(`$$referToUiFile(${JSON.stringify(id)}, ["createDocsRenderer"]);`);
  });

  test("leaves another module of the file alone", async () => {
    for (const query of ["raw", "v=1a2b3c4d&raw"]) {
      const id = `${framework}/client-story.js?${query}`;
      expect(await transformPackage.call(context("client"), clientStory, id), id).toBeUndefined();
    }
  });

  test("gives its file the page's own module for another of its files, by the file", async () => {
    // The version is the browser layer's: the rsc layer has one of its own.
    const browser = context("react_client");
    browser.resolve = async (source, importer) => ({
      id: `${new URL(source, `file://${importer}`).pathname}?v=5e6f7a8b`,
    });
    const importer = `${framework}/client-story.js?v=5e6f7a8b`;

    expect(await resolvePackage.call(browser, "./render.js", importer, {})).toBe(
      hostModuleId(`${framework}/render.js`),
    );
    // Not another module of a file of the host.
    browser.resolve = async (source, importer) => ({
      id: `${new URL(source, `file://${importer}`).pathname}?raw`,
    });
    const raw = await resolvePackage.call(browser, "./render.js?raw", importer, {});
    expect(String(raw).startsWith(liveModulePrefix)).toBe(true);
  });
});
