import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInThisContext } from "node:vm";
import { rolldown } from "rolldown";
import os from "node:os";
import { afterEach, beforeEach, expect, onTestFinished, test, vi } from "vitest";
import { compileServerCode, createServerCode } from "./server-code.ts";

const registry = "globalThis.__server__";
// A project that has Vitest, for the packages of the test runner.
const root = fileURLToPath(new URL("../../../../playground/nextjs-e2e-demo", import.meta.url));

// A browser, as far as server code can tell.
beforeEach(() => {
  vi.stubGlobal("window", { innerWidth: 390 });
  vi.stubGlobal("document", { title: "Browser" });
  vi.stubGlobal("location", { href: "http://browser.test/" });
  vi.stubGlobal("__server__", { fetch: () => "server fetch", Response: class ServerResponse {} });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// What a module leaves in `result`, compiled as server code.
async function run(source: string): Promise<unknown> {
  const compiled = await compileServerCode(source, "/app/module.js", registry);
  return runInThisContext(`(() => { ${compiled?.code ?? source}\nreturn result; })()`);
}

test("answers typeof window as a server does, and replaces nothing else of it", async () => {
  expect(await run(`var result = [typeof window, typeof document, typeof location];`)).toEqual([
    "undefined",
    "undefined",
    "undefined",
  ]);
  expect(await run(`var result = typeof(window);`)).toBe("undefined");
  expect(await run(`function f(window) { return typeof window; } var result = f(1);`)).toBe(
    "number",
  );
  // As in a server bundle of Next, the name itself is left alone.
  expect(await run(`var result = window.innerWidth;`)).toBe(390);
  // A CommonJS module can return at its top level.
  const compiled = await compileServerCode(
    `if (typeof window === "undefined") return;\nmodule.exports = 1;`,
    "/dependency/index.js",
    registry,
  );
  expect(compiled?.code).toContain(`"undefined" === "undefined"`);
});

test("keeps what is first in a module first", async () => {
  const compiled = await compileServerCode(
    `"use client";\nexport const width = typeof window;\nexport const load = () => fetch("/");`,
    "/app/module.js",
    registry,
  );

  expect(compiled?.code).toMatch(/^"use client";\n/);
});

test("reads fetch, Request and Response from the server", async () => {
  expect(await run(`var result = [fetch("/"), globalThis.fetch("/")];`)).toEqual([
    "server fetch",
    "server fetch",
  ]);
  expect(await run(`var result = new Response().constructor.name;`)).toBe("ServerResponse");
  expect(await run(`function load(fetch) { return fetch(); } var result = load(() => 1);`)).toBe(1);
  // Next patches the server's fetch by assigning to it.
  expect(await run(`globalThis.fetch = () => "patched"; var result = __server__.fetch();`)).toBe(
    "patched",
  );
});

test("makes its abort controllers and signals with the server's", async () => {
  class ServerAbortController {}
  const ServerAbortSignal = { timeout: () => "server signal" };
  vi.stubGlobal("__server__", {
    AbortController: ServerAbortController,
    AbortSignal: ServerAbortSignal,
  });
  expect(await run(`var result = new AbortController().constructor.name;`)).toBe(
    "ServerAbortController",
  );
  expect(await run(`var result = AbortSignal.timeout(1);`)).toBe("server signal");
});

test("has React's Flight server in the rsc layer queue a microtask with the server's queueMicrotask", async () => {
  const serverCode = createServerCode(registry);
  const compile = async (layer: "rsc" | "ssr", file: string) =>
    (
      await serverCode
        .optimizerPlugin(layer)
        .transform.call(
          { warn: vi.fn() },
          `var schedule = queueMicrotask; function performWork(request) {}`,
          file,
        )
    )?.code;
  const flightServer = (build: string) =>
    `/app/node_modules/next/dist/compiled/react-server-dom-webpack/cjs/react-server-dom-webpack-server.edge.${build}.js`;

  for (const build of ["development", "production"]) {
    expect(await compile("rsc", flightServer(build))).toContain(
      `var schedule = ${registry}.queueMicrotask;`,
    );
  }
  // No other module, and not the layer that renders HTML.
  expect(await compile("ssr", flightServer("development"))).toBeUndefined();
  expect(await compile("rsc", "/app/node_modules/next/dist/server/next.js")).toBeUndefined();
  expect(
    await compile(
      "rsc",
      "/app/node_modules/@vitejs/plugin-rsc/dist/vendor/react-server-dom/cjs/react-server-dom-webpack-server.edge.development.js",
    ),
  ).toBeUndefined();
});

test("has each step of a render of React's Flight server run with the stores of its first", async () => {
  const serverCode = createServerCode(registry);
  const { transform } = serverCode.optimizerPlugin("rsc");
  const file =
    "/app/node_modules/next/dist/compiled/react-server-dom-webpack/cjs/react-server-dom-webpack-server.edge.production.js";
  const code = `function performWork(request) { retryTask(request); }`;

  expect((await transform.call({ warn: vi.fn() }, code, file))?.code).toContain(
    `${registry}.performWork(request, performWorkOfReact)`,
  );
  // A React that renders some other way: the message says what to do.
  const error = await transform
    .call({ warn: vi.fn() }, `function work(request) {}`, file)
    .catch((error: unknown) => error);
  expect(String(error)).toContain("has no `function performWork(request) {`");
  expect(String(error)).toContain(
    "report it at https://github.com/storybookjs/vitest-plugin-rsc/issues",
  );
  // With the version of the Next.js the file is of.
  const next = path.dirname(createRequire(`${root}/`).resolve("next/package.json"));
  const { version } = JSON.parse(fs.readFileSync(`${next}/package.json`, "utf8")) as {
    version: string;
  };
  const ofNext = await transform
    .call(
      { warn: vi.fn() },
      `function work(request) {}`,
      file.replace("/app/node_modules/next", next),
    )
    .catch((error: unknown) => error);
  expect(String(ofNext)).toContain(`of next@${version}, has no`);
});

test("leaves code alone that names none of them", async () => {
  expect(
    await compileServerCode(`export const answer = 42;`, "/app/module.js", registry),
  ).toBeUndefined();
});

// Pre-bundles modules the way Vite's dependency optimizer does: Rolldown, with
// the plugin of a server layer.
async function prebundle(modules: Record<string, string>): Promise<string> {
  const serverCode = createServerCode(registry);
  const build = await rolldown({
    input: Object.keys(modules)[0]!,
    plugins: [
      {
        name: "modules",
        resolveId: (source, importer) =>
          importer ? path.posix.join(path.posix.dirname(importer), source) : source,
        load: (id) => modules[id],
      },
      serverCode.optimizerPlugin("ssr"),
    ],
  });
  const { output } = await build.generate({ format: "esm" });
  return output[0].code;
}

test("keeps the text of a function in a pre-bundled package of several modules", async () => {
  const script = `function script() { document.title = window.name; }`;
  const code = await prebundle({
    "/dependency/index.js": `
      import { other } from "./other.js";
      ${script}
      globalThis.result = [typeof window, other(), script.toString()];`,
    "/dependency/other.js": `
      export const other = () => (typeof window === "undefined" ? "server" : window.name);`,
  });

  runInThisContext(code);

  const [first, second, text] = (globalThis as unknown as { result: string[] }).result;
  expect([first, second]).toEqual(["undefined", "server"]);
  // The bundler prints it again, with its own whitespace and the same names.
  expect(text!.replace(/\s+/g, " ")).toBe(script);
});

test("pre-bundles a file that is not plain JavaScript as it is, with a warning", async () => {
  const warn = vi.fn();
  const { transform } = createServerCode(registry).optimizerPlugin("ssr");

  const result = await transform.call(
    { warn },
    `export const Width = () => <p>{typeof window}</p>;`,
    "/dependency/width.js",
  );

  expect(result).toBeUndefined();
  expect(warn).toHaveBeenCalledWith(expect.stringContaining("/dependency/width.js"));
});

test("tells the server code of a layer from the code of the test", () => {
  const serverCode = createServerCode(registry, {
    browserModules: ["test/**", "**/node_modules/@testing-library/**"],
  });
  serverCode.configure(root);
  serverCode.addTestFiles((file) => file.endsWith(".test.tsx"));
  // A second project that shares the plugin.
  serverCode.addTestFiles((file) => file.endsWith("vitest.setup.ts"));
  const file = (name: string) => path.join(root, name);
  const packageOf = (name: string) => fileURLToPath(import.meta.resolve(name));

  // Everything in the ssr layer is server code, but nothing in the browser's.
  expect(serverCode.isServerCode(file("app/page.test.tsx"), "ssr")).toBe(true);
  expect(serverCode.isServerCode(file("app/page.tsx"), "browser")).toBe(false);

  // The rsc layer shares its environment with the test.
  expect(serverCode.isServerCode(file("app/page.tsx"), "rsc")).toBe(true);
  expect(serverCode.isServerCode(file("node_modules/zod/index.js"), "rsc")).toBe(true);
  // A package is matched where the package manager really put it.
  const inStore = "/store/.pnpm/@testing-library+dom@10/node_modules/@testing-library/dom/x.js";
  expect(serverCode.isServerCode(inStore, "rsc")).toBe(false);
  expect(serverCode.isServerCode(file("app/page.test.tsx"), "rsc")).toBe(false);
  expect(serverCode.isServerCode(file("vitest.setup.ts"), "rsc")).toBe(false);
  expect(serverCode.isServerCode(file("test/render.tsx"), "rsc")).toBe(false);
  // Vitest, and the provider that drives the browser for it.
  expect(serverCode.isServerCode(packageOf("vitest"), "rsc")).toBe(false);
  expect(serverCode.isServerCode(packageOf("@vitest/browser-playwright"), "rsc")).toBe(false);

  // The runtime of this package is written for where it runs.
  const ownRuntime = fileURLToPath(new URL("./ssr.ts", import.meta.url));
  expect(serverCode.isServerCode(ownRuntime, "ssr")).toBe(false);
  expect(serverCode.isServerCode("\0virtual:module", "ssr")).toBe(false);
});

test("takes the files and the packages of another host for the host's", () => {
  const hostRoot = fileURLToPath(
    new URL("../../../../playground/nextjs-host-demo", import.meta.url),
  );
  const serverCode = createServerCode(registry, {
    // A package of the project, a scope of it, and this plugin itself, as a
    // framework of the host that depends on it would be matched.
    host: { files: ["host/**"], packages: ["host-report", "@types/*", "vitest-plugin-rsc"] },
  });
  serverCode.configure(hostRoot);
  // Again, as Vite calls `config` for a restart: not twice the matchers.
  serverCode.configure(hostRoot);
  const file = (name: string) => path.join(hostRoot, name);
  const packageOf = (name: string) =>
    fileURLToPath(import.meta.resolve(name, new URL("package.json", `file://${hostRoot}/`)));

  // A file of the host is not server code, and the app is.
  expect(serverCode.isHostFile(file("host/main.tsx"))).toBe(true);
  expect(serverCode.isServerCode(file("host/main.tsx"), "rsc")).toBe(false);
  expect(serverCode.isAppCode(file("host/main.tsx"), "rsc")).toBe(false);
  expect(serverCode.isServerCode(file("app/page.tsx"), "rsc")).toBe(true);
  expect(serverCode.isAppCode(file("app/page.tsx"), "rsc")).toBe(true);

  // A package of the host, by its name and by its scope.
  expect(serverCode.isHostPackage("host-report")).toBe(true);
  expect(serverCode.isHostPackage("@types/react")).toBe(true);
  expect(serverCode.isHostPackage("react")).toBe(false);
  expect(serverCode.isServerCode(packageOf("host-report"), "rsc")).toBe(false);
  // Where the package manager really put it, as Vite names the file.
  const typesOfReact = fs.realpathSync(file("node_modules/@types/react"));
  expect(serverCode.isServerCode(path.join(typesOfReact, "index.d.ts"), "rsc")).toBe(false);
  expect(serverCode.isServerCode(packageOf("react"), "rsc")).toBe(true);
  // What this plugin is built on stays server code, also when a framework
  // of the host brings the plugin: Vite RSC's Flight server.
  // Resolved from the plugin, which is what depends on it.
  const flight = fileURLToPath(import.meta.resolve("@vitejs/plugin-rsc/plugin"));
  expect(serverCode.isServerCode(flight, "rsc")).toBe(true);
});

test("adds the files of another host to the test files of Vitest", () => {
  const hostRoot = fileURLToPath(
    new URL("../../../../playground/nextjs-host-demo", import.meta.url),
  );
  const serverCode = createServerCode(registry, { host: { files: ["host/**"] } });
  serverCode.configure(hostRoot);
  const file = (name: string) => path.join(hostRoot, name);
  // What Vitest's config says, as `configureVitest` passes it on.
  serverCode.addTestFiles((candidate) => candidate.endsWith(".test.ts"));

  // Both are the host's, and the app is still server code.
  expect(serverCode.isHostFile(file("host/main.tsx"))).toBe(true);
  expect(serverCode.isHostFile(file("test/host.test.ts"))).toBe(true);
  expect(serverCode.isServerCode(file("test/host.test.ts"), "rsc")).toBe(false);
  expect(serverCode.isServerCode(file("host/main.tsx"), "rsc")).toBe(false);
  expect(serverCode.isServerCode(file("app/page.tsx"), "rsc")).toBe(true);
  // Vitest's packages are still the host's, next to the option's.
  expect(serverCode.isHostPackage("vitest/browser")).toBe(true);
  expect(serverCode.isHostPackage("@vitest/spy")).toBe(true);
});

// A project on disk: `packages` is the dependency tree, by path under
// `node_modules`, each with its own `dependencies`; `app` is what the
// project's package.json lists. Gone when the test ends.
function fakeProject(app: string[], packages: Record<string, string[]>): string {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "vitest-plugin-rsc-walk-")));
  onTestFinished(() => fs.rmSync(root, { recursive: true, force: true }));
  const write = (dir: string, name: string, dependencies: string[]) => {
    fs.mkdirSync(dir, { recursive: true });
    const manifest = { name, dependencies: Object.fromEntries(dependencies.map((d) => [d, "*"])) };
    fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify(manifest));
    fs.writeFileSync(path.join(dir, "index.js"), "");
  };
  write(root, "app", app);
  for (const [name, dependencies] of Object.entries(packages)) {
    write(path.join(root, "node_modules", name), name, dependencies);
  }
  return root;
}

test("leaves what the project itself depends on to the app, in the walk of the host's packages", () => {
  // The host's package depends on `react` and on `shared`, as the app does,
  // and on `theme`, which is the host's alone. `host-core` depends on `next`
  // and on a version of `react` of its own, which the package manager keeps
  // apart from the app's.
  const root = fakeProject(["react", "shared", "next"], {
    "host-ui": ["react", "shared", "theme"],
    react: [],
    shared: [],
    theme: ["shared"],
    next: [],
    "host-core": ["next", "react"],
    "host-core/node_modules/react": [],
  });
  const serverCode = createServerCode(registry, {
    host: { packages: ["host-ui", "host-core", "shared"] },
  });
  serverCode.configure(root);
  serverCode.addTestFiles(() => false);
  const moduleOf = (name: string) => path.join(root, "node_modules", name, "index.js");

  expect(serverCode.isServerCode(moduleOf("host-ui"), "rsc")).toBe(false);
  expect(serverCode.isServerCode(moduleOf("theme"), "rsc")).toBe(false);
  // The host names `shared`: the host's, though the app depends on it too.
  expect(serverCode.isServerCode(moduleOf("shared"), "rsc")).toBe(false);
  // The app's own dependencies stay server code, whichever package of the
  // host depends on them. A copy of the host's own is the host's.
  expect(serverCode.isServerCode(moduleOf("react"), "rsc")).toBe(true);
  expect(serverCode.isServerCode(moduleOf("next"), "rsc")).toBe(true);
  expect(serverCode.isServerCode(moduleOf("host-core/node_modules/react"), "rsc")).toBe(false);
});

test("leaves this plugin and what it depends on out of the walk of the host's packages, by their directories", () => {
  // A framework of the host that depends on the plugin, under a name of its
  // own as with an alias, and on what the plugin depends on.
  const plugin = fileURLToPath(new URL("../..", import.meta.url));
  const { dependencies = {} } = JSON.parse(
    fs.readFileSync(path.join(plugin, "package.json"), "utf8"),
  ) as { dependencies?: Record<string, string> };
  // Where Node.js finds them from the plugin, with any package manager.
  const fromPlugin = createRequire(path.join(plugin, "package.json"));
  const ownDependencies = Object.keys(dependencies).map((name) => {
    const paths = fromPlugin.resolve.paths(name) ?? [];
    const found = paths.find((dir) => fs.existsSync(path.join(dir, name, "package.json")));
    return fs.realpathSync(path.join(found!, name));
  });
  const root = fakeProject([], {
    "host-framework": ["renamed-plugin", "@vitejs/plugin-rsc", "theme"],
    theme: [],
  });
  const link = (name: string, to: string) => {
    fs.mkdirSync(path.dirname(path.join(root, "node_modules", name)), { recursive: true });
    fs.symlinkSync(to, path.join(root, "node_modules", name), "dir");
  };
  link("renamed-plugin", plugin);
  link(
    "@vitejs/plugin-rsc",
    ownDependencies[Object.keys(dependencies).indexOf("@vitejs/plugin-rsc")]!,
  );
  const serverCode = createServerCode(registry, { host: { packages: ["host-framework"] } });
  serverCode.configure(root);
  serverCode.addTestFiles(() => false);

  expect(serverCode.isServerCode(path.join(root, "node_modules/theme/index.js"), "rsc")).toBe(
    false,
  );
  // Every dependency of the plugin stays server code, like Vite RSC's Flight
  // server in the rsc layer.
  expect(ownDependencies.length).toBeGreaterThan(0);
  for (const dir of ownDependencies) {
    expect(serverCode.isServerCode(path.join(dir, "index.js"), "rsc"), dir).toBe(true);
  }
});

test("walks the package of a module of the host that `host.packages` names by its subpath", () => {
  // `host-ui/test` is a module of `host-ui`, which has no `package.json` of
  // its own there. So is `@host/blocks/preview` of `@host/blocks`, and every
  // module under `host-kit/internal/` of `host-kit`.
  const root = fakeProject([], {
    "host-ui": ["theme"],
    theme: [],
    "@host/blocks": [],
    "host-kit": [],
  });
  const serverCode = createServerCode(registry, {
    // `missing` is not installed: skipped, like a package that is missing.
    host: {
      packages: ["host-ui/test", "@host/blocks/preview", "host-kit/internal/*", "missing/sub"],
    },
  });
  serverCode.configure(root);
  serverCode.addTestFiles(() => false);
  const moduleOf = (name: string) => path.join(root, "node_modules", name, "index.js");

  // The module is the page's, and the rest of its package is not.
  expect(serverCode.isHostPackage("host-ui/test")).toBe(true);
  expect(serverCode.isHostPackage("host-ui/test/spy")).toBe(true);
  expect(serverCode.isHostPackage("host-ui")).toBe(false);
  expect(serverCode.isHostPackage("host-ui/theming")).toBe(false);
  expect(serverCode.isHostPackage("@host/blocks/preview")).toBe(true);
  expect(serverCode.isHostPackage("@host/blocks")).toBe(false);
  expect(serverCode.isHostPackage("host-kit/internal/preview")).toBe(true);
  expect(serverCode.isHostPackage("host-kit")).toBe(false);
  // The files of the package are the host's runtime, in the rsc layer too,
  // and so are what it depends on.
  expect(serverCode.isServerCode(moduleOf("host-ui"), "rsc")).toBe(false);
  expect(serverCode.isServerCode(moduleOf("theme"), "rsc")).toBe(false);
  expect(serverCode.isServerCode(moduleOf("@host/blocks"), "rsc")).toBe(false);
  expect(serverCode.isServerCode(moduleOf("host-kit"), "rsc")).toBe(false);
});

test("stops with a message when nothing says which files are the host's", async () => {
  const serverCode = createServerCode(registry);
  serverCode.configure(root);
  const plugin = serverCode.plugin({ client: "rsc", ssr: "ssr" });
  const transform = (plugin.transform as (this: unknown, code: string, id: string) => unknown).bind(
    { environment: { name: "client", config: { cacheDir: path.join(root, ".vite") } } },
  );
  const file = path.join(root, "app/page.tsx");
  await expect(() => transform("export const x = typeof window;", file)).rejects.toThrow(
    "nothing says which",
  );
  // Once Vitest's config, or `host.files`, has said so, the app is compiled.
  serverCode.addTestFiles((candidate) => candidate.endsWith(".test.tsx"));
  await expect(transform("export const x = typeof window;", file)).resolves.toMatchObject({
    code: expect.stringContaining('"undefined"'),
  });
  // A module that is no file is a plugin's, like the entries of the page of
  // a host, and never server code: the plugin that makes it compiles it.
  const virtual = "/virtual:/@host-kit/builder/app.js";
  await expect(transform("export const x = typeof window;", virtual)).resolves.toBeUndefined();
});

test("compiles the async functions of the modules of Next that await in a store, each in its layer, and of no other module", () => {
  const serverCode = createServerCode(registry);
  const compileIn = (layer: "rsc" | "ssr" | "browser") => {
    const { transform } = serverCode.asyncFunctionsOptimizerPlugin(layer);
    return (file: string) =>
      transform.call({ warn: vi.fn() }, `export async function cache() { await generate(); }`, file)
        ?.code;
  };
  const rsc = compileIn("rsc");
  const ssr = compileIn("ssr");
  const browser = compileIn("browser");
  const compiled = `await ${registry}.asyncFunctionHooks.s(`;

  for (const build of ["esm/server", "server"]) {
    const of = (nextModule: string) => `/app/node_modules/next/dist/${build}/${nextModule}`;
    // The wrapper of a "use cache" function is the rsc layer's.
    expect(rsc(of("use-cache/use-cache-wrapper.js"))).toContain(compiled);
    expect(ssr(of("use-cache/use-cache-wrapper.js"))).toBeUndefined();
    // The handler of a Server Action and the render are the ssr layer's,
    // through `app-page/module`.
    for (const nextModule of ["app-render/action-handler.js", "app-render/app-render.js"]) {
      expect(ssr(of(nextModule))).toContain(compiled);
      expect(rsc(of(nextModule))).toBeUndefined();
      expect(browser(of(nextModule))).toBeUndefined();
    }
  }
  for (const compile of [rsc, ssr]) {
    expect(
      compile("/app/node_modules/next/dist/esm/server/use-cache/cache-tag.js"),
    ).toBeUndefined();
    expect(
      compile("/app/node_modules/next/dist/esm/server/app-render/create-component-tree.js"),
    ).toBeUndefined();
    expect(compile("/app/node_modules/next/dist/esm/client/app-render/app-render.js")).toBe(
      undefined,
    );
    expect(compile("/app/node_modules/zod/index.js")).toBeUndefined();
  }
});

test("compiles the modules of Next that await in a store in their layer for a static build too, and React's Flight server in the rsc layer alone", () => {
  const serverCode = createServerCode(registry);
  const forStores = (layer: "rsc" | "ssr", code: string, file: string) =>
    serverCode.forStores({ warn: vi.fn() }, code, file, layer).code;
  const code = `export async function handleAction() { await generateFlight(); }`;
  const handler = "/app/node_modules/next/dist/esm/server/app-render/action-handler.js";
  const compiled = `${registry}.asyncFunctionHooks.e(`;

  expect(forStores("ssr", code, handler)).toContain(compiled);
  expect(forStores("rsc", code, handler)).toBe(code);
  const wrapper = "/app/node_modules/next/dist/esm/server/use-cache/use-cache-wrapper.js";
  expect(forStores("rsc", code, wrapper)).toContain(compiled);
  expect(forStores("ssr", code, wrapper)).toBe(code);
  const flight =
    "/app/node_modules/next/dist/compiled/react-server-dom-webpack/cjs/react-server-dom-webpack-server.edge.production.js";
  const work = `function performWork(request) { retryTask(request); }`;
  expect(forStores("rsc", work, flight)).toContain(`${registry}.performWork(`);
  expect(forStores("ssr", work, flight)).toBe(work);
});

test("compiles Next's own handler of a Server Action as the ssr optimizer pre-bundles it", async () => {
  const next = path.dirname(createRequire(`${root}/`).resolve("next/package.json"));
  const file = fs.realpathSync(path.join(next, "dist/esm/server/app-render/action-handler.js"));
  const serverCode = createServerCode(registry);
  // The file by the path it has on disk, as the bundler loads it, with what
  // it imports left out.
  const build = await rolldown({
    input: file,
    external: (_source, importer) => importer !== undefined,
    plugins: [serverCode.optimizerPlugin("ssr"), serverCode.asyncFunctionsOptimizerPlugin("ssr")],
    logLevel: "silent",
  });
  const { output } = await build.generate({ format: "esm" });
  const code = output[0].code;
  const hooks = `${registry}.asyncFunctionHooks`.replaceAll(".", "\\.");

  // The handler takes the stores it is called with.
  expect(code).toMatch(
    new RegExp(`async function handleAction\\([^)]*\\) \\{\\s*const \\w+ = ${hooks}\\.e\\(\\)`),
  );
  // And has them back after the `await` of the render after the action, in
  // the `exit()` of the action's store.
  expect(code).toMatch(new RegExp(`await ${hooks}\\.s\\([^,]+, \\(?actionAsyncStorage\\.exit\\(`));
});

test("compiles the async functions of the app's server code in the rsc layer, not of a test file", () => {
  const serverCode = createServerCode(registry);
  serverCode.configure(root);
  serverCode.addTestFiles((file) => file.endsWith(".test.tsx"));
  const { transform } = serverCode.asyncFunctionsPlugin("client") as unknown as {
    transform(this: object, code: string, id: string): { code: string } | undefined;
  };
  const context = { environment: { config: { cacheDir: path.join(root, "node_modules/.vite") } } };
  const code = `export async function load() { await data(); }`;

  expect(transform.call(context, code, path.join(root, "app/page.tsx"))?.code).toContain(
    `await ${registry}.asyncFunctionHooks.s(`,
  );
  expect(transform.call(context, code, path.join(root, "app/app.test.tsx"))).toBeUndefined();
  // A dependency is compiled when it is pre-bundled, or not at all.
  const dependency = path.join(root, "node_modules/next/dist/server/next.js");
  expect(transform.call(context, code, dependency)).toBeUndefined();
});

test("leaves the async functions of a file that does not parse as they are, with a warning", () => {
  const serverCode = createServerCode(registry);
  serverCode.configure(root);
  serverCode.addTestFiles((file) => file.endsWith(".test.tsx"));
  const { transform } = serverCode.asyncFunctionsPlugin("client") as unknown as {
    transform(this: object, code: string, id: string): { code: string } | undefined;
  };
  const warn = vi.fn();
  const context = { warn, environment: { config: { cacheDir: "/cache" } } };
  const page = path.join(root, "app/page.tsx");

  expect(
    transform.call(context, `export const load = async () => <p>{await data()}</p>;`, page),
  ).toBe(undefined);
  expect(warn).toHaveBeenCalledWith(expect.stringContaining(`${page} do not keep their stores`));
});

test("compiles nothing for the stores where the server's own AsyncLocalStorage carries them, in a worker of Node.js", async () => {
  const serverCode = createServerCode(registry);
  serverCode.configure(root, "native");
  serverCode.addTestFiles((candidate) => candidate.endsWith(".test.tsx"));
  const asyncFunction = `export async function cache() { await generate(); }`;
  const nextModule = "/app/node_modules/next/dist/esm/server/use-cache/use-cache-wrapper.js";
  // Next's modules that await in a store, the app's source files, and
  // React's Flight server: as they are, but for what server code is compiled
  // for otherwise.
  expect(
    serverCode
      .asyncFunctionsOptimizerPlugin("rsc")
      .transform.call({ warn: vi.fn() }, asyncFunction, nextModule),
  ).toBeUndefined();
  const appPlugin = serverCode.asyncFunctionsPlugin("client");
  const transform = (appPlugin.transform as { handler?: unknown }).handler ?? appPlugin.transform;
  expect(
    await (transform as (this: object, code: string, id: string) => unknown).call(
      { environment: { config: { cacheDir: "/cache" } }, warn: vi.fn() },
      asyncFunction,
      path.join(root, "app/page.tsx"),
    ),
  ).toBeUndefined();
  const flightServer =
    "/app/node_modules/next/dist/compiled/react-server-dom-webpack/cjs/react-server-dom-webpack-server.edge.production.js";
  const flight = await serverCode
    .optimizerPlugin("rsc")
    .transform.call(
      { warn: vi.fn() },
      `var schedule = queueMicrotask; function performWork(request) {}`,
      flightServer,
    );
  expect(flight?.code ?? "").not.toContain("performWork(request, performWorkOfReact)");
  expect(flight?.code ?? "").not.toContain(`${registry}.queueMicrotask`);
  // And the pre-bundles say so in their key.
  expect(serverCode.cacheKey.__vitest_plugin_rsc_async_context__).toBe('"native"');
});
