import "./compile-cache.ts";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { normalizePath, type DevEnvironment, type Plugin, type ViteDevServer } from "vite";
import { vitePluginRscMinimal } from "@vitejs/plugin-rsc/plugin";
import { createReactClientCoveragePlugin } from "./coverage.ts";
import { dependencyTransformPlugin } from "./dependency-transforms.ts";
import { changedAfter, onInvalidation, versionOf } from "./module-versions.ts";
import { mapOfRelatedLookup } from "./related-lookup.ts";
import {
  hostsPageInNode,
  isTestServer,
  projectsHostPageInNode,
  servesPageInNode,
} from "./page-in-node.ts";
import { createRunnerEnvironmentPlugins } from "./runner-environment.ts";
import { staticBuild } from "./static-build.ts";
import { referencingTestFilesLast } from "./test-file-references.ts";
import { builtinsKey, type ProvidedBuiltins } from "./worker-run.ts";
import type { PageAnswers } from "./worker-pool.ts";
import { pageViteClientPlugin } from "./vite-client.ts";
import {
  answerOf,
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

// `node:async_hooks` is this package's `async-hooks`, in every layer. Vite's
// dependency optimizer takes an aliased bare import for a dependency of its
// own, whatever imports it, also a file of this package: unless the
// optimizers of the page exclude it, the first module to import it with a
// cold cache has Vite pre-bundle again and reload the page, which then has no
// runner for the tests.
const asyncHooks = {
  "node:async_hooks": "vitest-plugin-rsc/async-hooks",
  async_hooks: "vitest-plugin-rsc/async-hooks",
};
const asyncHooksIds = Object.keys(asyncHooks);

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
  // Whether the page is in a worker of Node.js: what the config of the
  // server says, see `servesPageInNode()`. Under any other host, like
  // Storybook or a static build, the page is in a browser.
  const page = { inNode: false };
  // The directory of the server's files of the run, in a worker of Node.js.
  let serverFiles = "";
  return [
    pageViteClientPlugin(),
    ...mapOfRelatedLookup(
      referencingTestFilesLast(
        vitePluginRscMinimal({
          environment: {
            browser: "react_client",
            rsc: "client",
          },
          defineEncryptionKey: encryptionKey,
        }),
      ),
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
        if (!hostsPageInNode(project.config)) return;
        if (!page.inNode) throw serverOfAnotherHost(project);
        // The server's own files of the run, like the cache of Next's build:
        // each worker has a directory in it (node-host.ts). This process
        // removes it, as a worker that Vitest stops does not run its `exit`.
        if (!serverFiles) {
          const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vitest-plugin-rsc-"));
          serverFiles = dir;
          vitest.onClose(() => fs.rmSync(dir, { recursive: true, force: true }));
        }
        await startWorkerPage(project);
        // Vitest keeps what it compiled on disk for the next run, by a key
        // without the version of the optimizer's pre-bundles, which it has
        // turned off without Browser Mode: a module that imports one has
        // that version in its URL. The key of a module is made once in a
        // run: a module that imports a pre-bundle that the optimizer bundles
        // again mid-run, as it finds a dependency, keeps the old version in
        // its URL until the next run. Nor with the directory of the
        // pre-bundles, which is the project's: two projects with the same
        // optimizer's config have the same version, but each its own URLs.
        defineCacheKeyGenerator?.(
          ({ environment }) =>
            `${environment.config.cacheDir}:${environment.depsOptimizer?.metadata.browserHash ?? ""}`,
        );
      }) as unknown as () => void,
      resolveId(source) {
        if (source !== pageHostId) return;
        // In a browser the host's own file, with no module in between for
        // the page to fetch.
        return page.inNode && devServer ? `\0${pageHostId}` : ownFile("browser-host");
      },
      load(id) {
        if (id !== `\0${pageHostId}` || !devServer) return;
        return (
          `import { nodeHost } from ${JSON.stringify(ownFile("node-host"))};\n` +
          `export default nodeHost(${JSON.stringify(serverFiles)});\n`
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
          resolve: { alias: asyncHooks },
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
                exclude: ["vite", "vitest-plugin-rsc", "@vitejs/plugin-rsc", ...asyncHooksIds],
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
                exclude: ["vitest-plugin-rsc", "@vitejs/plugin-rsc", ...asyncHooksIds],
              },
            },
          },
        };
      },
    },
    // What the page in a worker asks, the plugin's own dev server answers:
    // Vitest's project may have another object for it.
    ...workerPlugins(page, (event, data) => answerOf(devServer!, event, data)),
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
  name: string;
  sharedViteServer: boolean;
  config: {
    browser: { enabled: boolean };
    environment: string;
    environmentOptions?: Record<string, Record<string, unknown> | undefined>;
  };
  vite: ViteDevServer;
  provide(key: string, value: unknown): void;
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
  // What a runner of each environment leaves to Node.js, which the page's
  // runners ask its environment for, and Vitest's RPC does not answer: see
  // vitest-modules.ts. As Vite's environment answers `getBuiltins`.
  const builtins: ProvidedBuiltins = {};
  for (const [name, environment] of Object.entries(project.vite.environments)) {
    builtins[name] = environment.config.resolve.builtins.map((builtin) =>
      typeof builtin === "string"
        ? { type: "string", value: builtin }
        : { type: "RegExp", source: builtin.source, flags: builtin.flags },
    );
  }
  project.provide(builtinsKey, builtins);
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
  projects?: unknown[];
  sharedViteServer?: boolean;
  pool?: string | { name: string };
  environment?: string;
  include?: string[];
  setupFiles?: string | string[];
  server?: { deps?: { inline?: (string | RegExp)[] | true } };
};

// The pool of a page in a worker of Node.js: Vitest's forks, with the
// plugin's entry of the worker (worker-pool.ts), which hands the page Vitest's
// own RPC to the dev server, and answers its questions with the answers of
// page-bridge.ts. Loaded by its path, as only Vitest loads a file that
// imports Vitest: a host other than Vitest has the plugin without it.
async function withNodeHostPool(
  pool: TestOptions["pool"],
  answers: PageAnswers,
): Promise<{ name: string }> {
  const { createNodeHostPool, nodeHostPoolName } = (await import(
    pathToFileURL(ownFile("worker-pool")).href
  )) as typeof import("./worker-pool.ts");
  const ours = typeof pool === "object" && pool.name === nodeHostPoolName;
  if (pool === undefined || pool === "forks" || ours) return createNodeHostPool(answers);
  const name = typeof pool === "string" ? pool : pool.name;
  throw new Error(
    `vitest-plugin-rsc: a project whose page is in a worker of Node.js, without Browser Mode, ` +
      `runs in the plugin's pool: Vitest's forks, with the plugin's entry of the worker. This ` +
      `project sets \`test.pool\` to ${JSON.stringify(name)}: leave it out, or set it to "forks".`,
  );
}

// A project whose page is in a worker of Node.js, on a server whose `config`
// hooks made it for a page in a browser.
function serverOfAnotherHost(project: VitestProject): Error {
  const fix = project.sharedViteServer
    ? `It shares the server of the config that declares it, which Vitest resolves for it ` +
      `without the plugins' \`config\` hooks. Give it a server of its own: set ` +
      `\`test.sharedViteServer: false\` in the root config.`
    : `Set \`test.environment\` in the project's config, where the plugins' \`config\` ` +
      `hooks see it.`;
  return new Error(
    `vitest-plugin-rsc: the project ${JSON.stringify(project.name)} has its page in a worker ` +
      `of Node.js, in ${project.config.environment} without Browser Mode, on a Vite server ` +
      `made for a page in a browser. ${fix}`,
  );
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Where the config is of a page in a worker, which these decide for the
// server: only then they do anything.
function workerPlugins(page: { inNode: boolean }, answers: PageAnswers): Plugin[] {
  const before = new Map<string, unknown>();
  return [
    {
      name: "rsc:page-in-worker",
      config: {
        order: "post",
        async handler(config, { command }) {
          const { test } = config as { test?: TestOptions };
          page.inNode = servesPageInNode(config, command);
          // Each project then has a server of its own, as before Vitest 5:
          // see `projectsHostPageInNode()`.
          if (test && isTestServer(config, command) && projectsHostPageInNode(test)) {
            test.sharedViteServer = false;
          }
          if (!test || !page.inNode) return;
          test.pool = await withNodeHostPool(test.pool, answers);
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
          // The page in a realm of its own, and Node's web APIs on the
          // worker's global for the server: see happy-dom-environment.ts.
          if (test.environment === "happy-dom") test.environment = ownFile("happy-dom-environment");
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
          if (page.inNode && (config.consumer === "client" || name === "client")) {
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
