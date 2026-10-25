import "./compile-cache.ts";
import fs from "node:fs";
import { isBuiltin } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { normalizePath, type DevEnvironment, type Plugin, type ViteDevServer } from "vite";
import { vitePluginRscMinimal } from "@vitejs/plugin-rsc/plugin";
import { createReactClientCoveragePlugin } from "./coverage.ts";
import { dependencyTransformPlugin } from "./dependency-transforms.ts";
import { changedAfter, onInvalidation, versionOf } from "./module-versions.ts";
import { hostsPageInNode } from "./page-in-node.ts";
import { createRunnerEnvironmentPlugins } from "./runner-environment.ts";
import { staticBuild } from "./static-build.ts";
import { referencingTestFilesLast } from "./test-file-references.ts";
import { pageViteClientPlugin } from "./vite-client.ts";
import {
  answerPage,
  answerPageOverWebSocket,
  answerPageWith,
  listenForPage,
  tellPages,
} from "./page-bridge.ts";
import {
  changedEvent,
  invokeEvent,
  versionEvent,
  modulesChangedEvent,
  webSocketInfoPath,
  type ChangedQuestion,
  type ModulesChanged,
} from "./page-protocol.ts";

type ReactClientInvokePayload = Parameters<
  ViteDevServer["environments"][string]["hot"]["handleInvoke"]
>[0];
type ReactClientWebSocketInvoke = {
  id: string;
  environment: string;
  /** Without one, the page asks for the version of the modules of the environment. */
  payload?: ReactClientInvokePayload;
};

// The Flight codec that Vite RSC brings, to pre-bundle. It is a dependency of
// this package and not of the project, so Vite is told to look for it from
// here: a package manager like pnpm does not put it where the project finds it.
const vendoredFlight = (entry: string) =>
  `vitest-plugin-rsc > @vitejs/plugin-rsc/vendor/react-server-dom/${entry}`;

function withConfiguredSourceConditions(
  config: { resolve?: { conditions?: string[] } },
  conditions: string[],
): string[] {
  const sourceConditions = (config.resolve?.conditions ?? []).filter(
    (condition) => condition === "vitest-plugin-rsc-source",
  );
  return [...new Set([...sourceConditions, ...conditions])];
}

// The key of Vite RSC for the variables that an inline Server Action keeps,
// like the `id` of `async () => { "use server"; await remove(id); }`. It is
// one key, not a new one for every run: the server is the page, which has
// the key anyway, so it keeps nothing from the browser. A static build has it
// in a file, which is then the same in every build. The 32 bytes of
// `vitest-plugin-rsc-encryption-key`, in base64.
const encryptionKey = JSON.stringify("dml0ZXN0LXBsdWdpbi1yc2MtZW5jcnlwdGlvbi1rZXk=");

// The host of the page, see page-host.ts: a browser, or without Vitest's
// Browser Mode a worker of Node.js. By the file of this package that is the
// one, in `src` or in `dist`.
const pageHostId = "virtual:vitest-plugin-rsc/page-host";
const ownFile = (name: string) =>
  normalizePath(
    fileURLToPath(new URL(`./${name}${path.extname(import.meta.url)}`, import.meta.url)),
  );

export function vitestPluginRSC(): Plugin[] {
  let devServer: ViteDevServer | undefined;
  // Whether the page is in a worker of Node.js, which Vitest says of a
  // project once its config is resolved: see `hostsPageInNode()`. Under
  // any other host, like Storybook or a static build, the page is in a
  // browser.
  let inNode = false;
  // The directory of the server's files of the run, in a worker of Node.js.
  let serverFiles = "";
  return [
    pageViteClientPlugin(),
    ...referencingTestFilesLast(
      vitePluginRscMinimal({
        environment: {
          browser: "react_client",
          rsc: "client",
        },
        defineEncryptionKey: encryptionKey,
      }),
    ),
    // `vite build`, and what a dev server has instead: see static-build.ts.
    staticBuild({
      rsc: "client",
      browser: "react_client",
      layers: { entries: { react_client: "vitest-plugin-rsc/testing-library-client" } },
    }),
    {
      name: "rsc:run-in-browser",
      // Vitest's hook, which awaits what it returns.
      configureVitest: (async ({
        vitest,
        project,
        defineCacheKeyGenerator,
      }: VitestPluginContext) => {
        inNode = hostsPageInNode(project.config);
        if (!inNode) return;
        // The server's own files of the run, like the cache of Next's build:
        // each worker has a directory in it (node-host.ts). This process
        // removes it, as a worker that Vitest stops does not run its `exit`.
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vitest-plugin-rsc-"));
        serverFiles = dir;
        vitest.onClose(() => fs.rmSync(dir, { recursive: true, force: true }));
        await startWorkerPage(project);
        // Vitest keeps what it compiled on disk for the next run, by a key
        // without the version of the optimizer's pre-bundles, which it has
        // turned off without Browser Mode: a module that imports one has
        // that version in its URL. The key of a module is made once in a
        // run: a module that imports a pre-bundle that the optimizer bundles
        // again mid-run, as it finds a dependency, keeps the old version in
        // its URL until the next run.
        defineCacheKeyGenerator?.(
          ({ environment }) => environment.depsOptimizer?.metadata.browserHash ?? "",
        );
      }) as unknown as () => void,
      resolveId(source) {
        if (source !== pageHostId) return;
        // In a browser the host's own file, with no module in between for
        // the page to fetch.
        return inNode && devServer ? `\0${pageHostId}` : ownFile("browser-host");
      },
      async load(id) {
        if (id !== `\0${pageHostId}` || !devServer) return;
        const origin = await listenForPage(devServer);
        return (
          `import { nodeHost } from ${JSON.stringify(ownFile("node-host"))};\n` +
          `export default nodeHost(${JSON.stringify(origin)}, ${JSON.stringify(serverFiles)});\n`
        );
      },
      configureServer(server) {
        devServer = server;
        // The pages hear of every change of the modules of an environment,
        // before any answer that the server makes after it: so a page
        // compares versions where it would ask for them. See `heardVersions`
        // in utils.ts.
        onInvalidation(server, (environment) => {
          const changed: ModulesChanged = {
            environment,
            version: versionOf(server.environments[environment]?.moduleGraph),
          };
          tellPages(server, modulesChangedEvent, changed);
        });
        // The ids of the modules of an environment that Vite invalidated
        // after a version of them, for a runner of the page that has that
        // version: see `takeChangedModules()` in utils.ts.
        answerPage(server, changedEvent, ({ environment, since }: ChangedQuestion) =>
          changedAfter(server.environments[environment]?.moduleGraph, since),
        );

        // The page runs every environment but `client` through a module
        // runner of its own, see utils.ts.
        answerPageWith(server, invokeEvent, async (invoke: Partial<ReactClientWebSocketInvoke>) => {
          if (!invoke.payload) return undefined;
          const name = invoke.environment ?? "react_client";
          const environment = server.environments[name];
          if (!environment || name === "client") {
            return { error: { message: `No environment "${name}" to run in the page` } };
          }
          const builtin = inNode ? nodeBuiltinOf(invoke.payload) : undefined;
          if (builtin) return { result: { externalize: builtin, type: "builtin" } };
          return describeModule(environment, await environment.hot.handleInvoke(invoke.payload));
        });
        answerPageWith(server, versionEvent, ({ environment }: { environment?: string }) =>
          versionOf(server.environments[environment ?? "react_client"]?.moduleGraph),
        );
        answerPageOverWebSocket(server);

        server.middlewares.use((req, res, next) => {
          const url = new URL(req.url ?? "/", "https://any.local");
          if (url.pathname === webSocketInfoPath) {
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(getReactClientWebSocketInfo(server)));
            return;
          }

          next();
        });
      },
      config(config) {
        return {
          resolve: {
            alias: {
              "node:async_hooks": "vitest-plugin-rsc/async-hooks",
              async_hooks: "vitest-plugin-rsc/async-hooks",
            },
          },
          environments: {
            client: {
              keepProcessEnv: false,
              dev: {
                preTransformRequests: false,
              },
              // A browser's conditions, also in a worker of Node.js, where the
              // pre-bundles of this environment have Vite's empty module for
              // a module of Node.js. `vitestPluginNext()`, which gives the
              // server Node's own modules there, gives it Node's conditions.
              resolve: {
                conditions: withConfiguredSourceConditions(config, ["browser", "react-server"]),
              },
              optimizeDeps: {
                include: [
                  "react",
                  "react-dom",
                  "react-dom/client",
                  "react/jsx-runtime",
                  "react/jsx-dev-runtime",
                  vendoredFlight("server.edge"),
                  vendoredFlight("client.edge"),
                ],
                exclude: ["vite", "vitest-plugin-rsc", "@vitejs/plugin-rsc"],
              },
            },
            react_client: {
              consumer: "client",
              keepProcessEnv: false,
              resolve: {
                conditions: withConfiguredSourceConditions(config, ["browser"]),
                dedupe: ["react", "react-dom"],
              },
              dev: {
                moduleRunnerTransform: true,
                preTransformRequests: true,
              },
              optimizeDeps: {
                include: [
                  "react",
                  "react-dom",
                  "react-dom/client",
                  "react/jsx-runtime",
                  "react/jsx-dev-runtime",
                  vendoredFlight("client.browser"),
                ],
                exclude: ["vitest-plugin-rsc", "@vitejs/plugin-rsc"],
              },
            },
          },
        };
      },
    },
    ...workerPlugins(),
    dependencySourceMapPlugin(),
    dependencyTransformPlugin(),
    createReactClientCoveragePlugin(),
    ...createRunnerEnvironmentPlugins("react_client"),
  ];
}

// Without Browser Mode, Vitest runs the `client` environment in its worker,
// and turns off the dependency optimizer of every environment, for Node.js
// to import a dependency itself. The page's environments are a browser's,
// whose dependencies are bundled for the browser, with their conditions,
// like `react-server` for the rsc layer: Node.js would import another React.
// So each keeps the optimizer it had before Vitest's hook, which comes
// after the plugins of the config. And Vitest's runner evaluates what the
// optimizer bundled, as a browser does, where it would have Node.js import
// the file, which may not be written yet; and this package and Vite RSC,
// whose modules import the plugin's virtual modules. And the worker keeps
// Node's own web APIs for the server. With Browser Mode, Vitest leaves the
// environments as they are, and so do these.
type VitestProject = {
  config: {
    browser: { enabled: boolean };
    environment: string;
    environmentOptions?: Record<string, Record<string, unknown> | undefined>;
  };
  vite: ViteDevServer;
};
// What Vitest gives `configureVitest`.
type VitestPluginContext = {
  vitest: { onClose(close: () => void): void };
  project: VitestProject;
  defineCacheKeyGenerator?: (
    generate: (context: { environment: DevEnvironment }) => string,
  ) => void;
};

// What the page has from its host in a worker of Node.js, before the worker
// starts. The page's origin is the dev server's, as in a browser: what the
// page fetches by a path, like a file of the app, is the server's. The DOM
// gets the URL of the listener, which the server's own `listen()` does not
// start without Browser Mode. And happy-dom's document stays, as the
// browser's does, where a link or a form would load another: the page has
// the navigations (see node-host.ts). A stylesheet it does not load is one
// that loaded.
async function startWorkerPage(project: VitestProject): Promise<void> {
  const origin = await listenForPage(project.vite);
  const options = (project.config.environmentOptions ??= {});
  for (const dom of ["happyDOM", "jsdom"]) (options[dom] ??= {}).url = `${origin}/`;
  const settings = (options.happyDOM!.settings ??= {}) as Record<string, unknown>;
  settings.handleDisabledFileLoadingAsSuccess ??= true;
  settings.navigation = {
    disableMainFrameNavigation: true,
    disableFallbackToSetURL: true,
    ...(settings.navigation as object | undefined),
  };
  await optimizersSettled(project.vite);
}

// A worker of Node.js imports a pre-bundled dependency by the version that
// Vite says it has when it compiles the importer, and Vite fails a request of
// a version from before its first bundling ends, for the page to load again,
// as a browser would. A worker does not load again, so it starts once the
// optimizer of each environment of the page has done its first bundling.
async function optimizersSettled(server: ViteDevServer): Promise<void> {
  await Promise.all(
    Object.values(server.environments).map(async (environment) => {
      const optimizer = environment.depsOptimizer;
      if (!optimizer || environment.config.consumer !== "client") return;
      await optimizer.init();
      await optimizer.scanProcessing;
      for (;;) {
        const discovered = Object.values(optimizer.metadata.discovered);
        if (discovered.length === 0) return;
        await Promise.all(discovered.map((info) => info.processing ?? Promise.resolve()));
      }
    }),
  );
}

type TestOptions = {
  browser?: { enabled?: boolean };
  environment?: string;
  include?: string[];
  setupFiles?: string | string[];
  execArgv?: string[];
  server?: { deps?: { inline?: (string | RegExp)[] | true } };
};

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function workerPlugins(): Plugin[] {
  // Whether the config is of a page in a worker: then only these do anything.
  let inWorker = false;
  const before = new Map<string, unknown>();
  return [
    {
      name: "rsc:page-in-worker",
      config: {
        order: "post",
        handler(config) {
          const { test } = config as { test?: TestOptions };
          inWorker = hostsPageInNode(test);
          if (!test || !inWorker) return;
          // The pre-bundles of its own: the projects of a root that run in a
          // browser bundle the same dependencies, from other entries.
          const root = config.root ?? process.cwd();
          const cacheDir = path.resolve(root, config.cacheDir || "node_modules/.vite", "worker");
          const deps = ((test.server ??= {}).deps ??= {});
          if (deps.inline !== true) {
            deps.inline = [
              ...(deps.inline ?? []),
              new RegExp(`^${escapeRegExp(normalizePath(cacheDir))}/`),
              /\/node_modules\/vitest-plugin-rsc\//,
              /\/node_modules\/@vitejs\/plugin-rsc\//,
            ];
          }
          // Node's own web APIs, kept for the server's layers before the DOM
          // replaces them: see worker-web-apis.ts.
          const webApis = pathToFileURL(ownFile("worker-web-apis")).href;
          test.execArgv = [...(test.execArgv ?? []), "--import", webApis];
          // What the optimizer of the rsc layer scans: the test files and the
          // setup files, which Vitest names with Browser Mode only. Without
          // them it finds their dependencies as a test imports them, and
          // bundles again, mid-run. Not a setup file of this package, like
          // the one of Browser Mode that `vitestPluginNext()` names and swaps
          // once Vitest says there is none: what this package imports is not
          // the app's.
          const ownDir = `${path.dirname(ownFile("index"))}/`;
          const entries = [
            ...(test.include ?? ["**/*.{test,spec}.?(c|m)[jt]s?(x)"]),
            ...[test.setupFiles ?? []]
              .flat()
              .filter((file) => !normalizePath(file).startsWith(ownDir)),
          ];
          return { cacheDir, environments: { client: { optimizeDeps: { entries } } } };
        },
      },
    },
    {
      name: "rsc:optimizer-before-vitest",
      configEnvironment: {
        order: "post",
        handler(name, config) {
          if (inWorker && (config.consumer === "client" || name === "client")) {
            before.set(name, config.optimizeDeps);
          }
        },
      },
    },
    {
      name: "rsc:optimizer-after-vitest",
      enforce: "post",
      configEnvironment: {
        order: "post",
        handler(name, config) {
          if (!before.has(name)) return;
          // But for Vitest, which the worker has one of, as Vitest's own
          // optimizer has it: bundled into a dependency that imports it,
          // like the matchers of `@testing-library/jest-dom`, it would be
          // another `expect` than the test's.
          const own = before.get(name) as typeof config.optimizeDeps;
          config.optimizeDeps = { ...own, exclude: [...(own?.exclude ?? []), "vitest"] };
        },
      },
    },
  ];
}

// A module of Node.js that a layer leaves to the runner to import, which in a
// worker of Node.js is Node's own (nextjs/node-builtins.ts). Vite's import
// analysis names it `/@id/node:fs` in an environment of a browser, and its
// `fetchModule()` takes that for a module of the environment. Vitest's runner
// of the `client` environment takes it for Node's module itself, and so does
// the runner of a page in a worker by this answer, which `import()`s it.
function nodeBuiltinOf(payload: ReactClientInvokePayload): string | undefined {
  const { name, data } = (payload as { data?: { name?: string; data?: unknown[] } }).data ?? {};
  if (name !== "fetchModule" || typeof data?.[0] !== "string") return;
  const id = data[0].replace(/^\/@id\//, "");
  return id.startsWith("node:") && isBuiltin(id) ? id : undefined;
}

// With the answer for a module, what that module imports: the page asks for
// those right away, where Vite's module runner asks for each once the one
// before it has run. Not what it imports with `import()`, which it may never
// load. And whether it is a dependency, which has no source map to collect
// coverage with.
function describeModule<Result extends object>(
  environment: DevEnvironment,
  result: Result,
): Result {
  const fetched = (result as { result?: { id?: unknown; code?: unknown } }).result;
  if (typeof fetched?.id !== "string" || typeof fetched.code !== "string") return result;
  const imports = environment.moduleGraph.getModuleById(fetched.id)?.transformResult?.deps;
  return { ...result, imports, dependency: isDependency(environment, fetched.id) };
}

function isDependency(environment: DevEnvironment, id: string): boolean {
  return id.includes("/node_modules/") || !!environment.depsOptimizer?.isOptimizedDepFile(id);
}

// The page gets a module of a layer it runs through a module runner with its
// source map in it, and a dependency has megabytes of those: more than its
// code. They are also what takes Vite longest when it compiles a pre-bundled
// dependency for a module runner. So a dependency goes without. An error in
// one is reported at its place in the compiled dependency.
function dependencySourceMapPlugin(): Plugin {
  return {
    name: "rsc:dependency-source-map",
    // Before a plugin with a source map of its own, which Vite then drops
    // without combining the two.
    enforce: "pre",
    transform(code, id) {
      const { environment } = this;
      const { consumer, dev } = environment.config;
      if (environment.mode !== "dev" || consumer !== "client" || !dev.moduleRunnerTransform) return;
      if (!isDependency(environment, id)) return;
      // What Rollup takes for a module without a source map. Vite keeps the
      // source map of the file when a module comes out of its plugins as it
      // went in, so it does not: a line more at the end moves nothing.
      return { code: `${code}\n`, map: { mappings: "" } };
    },
  };
}

// Vitest sets `server.hmr` to `false`, so the socket goes to the page's own
// host and port, and only needs the token and the base.
function getReactClientWebSocketInfo(server: ViteDevServer) {
  return { token: server.config.webSocketToken, path: server.config.base };
}
