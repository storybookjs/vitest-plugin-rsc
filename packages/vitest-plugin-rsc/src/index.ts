import "./compile-cache.ts";
import { type DevEnvironment, type Plugin, type ViteDevServer } from "vite";
import { vitePluginRscMinimal } from "@vitejs/plugin-rsc/plugin";
import { createReactClientCoveragePlugin } from "./coverage.ts";
import { dependencyTransformPlugin } from "./dependency-transforms.ts";
import { changedAfter, versionOf } from "./module-versions.ts";
import { createRunnerEnvironmentPlugins } from "./runner-environment.ts";
import { staticBuild } from "./static-build.ts";
import { referencingTestFilesLast } from "./test-file-references.ts";
import { pageViteClientPlugin } from "./vite-client.ts";
import {
  answerEvent,
  answerPage,
  changedEvent,
  invokeEvent,
  versionEvent,
  type ChangedQuestion,
  webSocketInfoPath,
  webSocketQuery,
} from "./websocket-bridge.ts";

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

export function vitestPluginRSC(): Plugin[] {
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
      configureServer(server) {
        // The ids of the modules of an environment that Vite invalidated
        // after a version of them, for a runner of the page that has that
        // version: see `takeChangedModules()` in utils.ts.
        answerPage(server, changedEvent, ({ environment, since }: ChangedQuestion) =>
          changedAfter(server.environments[environment]?.moduleGraph, since),
        );

        server.ws.on("connection", (socket, req) => {
          const url = new URL(req.url ?? "/", "https://any.local");
          if (url.searchParams.get(webSocketQuery) !== "1") {
            return;
          }

          socket.on("message", async (raw) => {
            const invoke = parseWebSocketInvoke(raw);
            if (!invoke) return;

            // The page runs every environment but `client` through a module
            // runner of its own, see utils.ts.
            const environment = server.environments[invoke.environment];
            const result = !invoke.payload
              ? versionOf(environment?.moduleGraph)
              : environment && invoke.environment !== "client"
                ? describeModule(environment, await environment.hot.handleInvoke(invoke.payload))
                : {
                    error: { message: `No environment "${invoke.environment}" to run in the page` },
                  };

            socket.send(
              JSON.stringify({
                type: "custom",
                event: answerEvent,
                data: {
                  id: invoke.id,
                  result,
                },
              }),
            );
          });
        });

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
    dependencySourceMapPlugin(),
    dependencyTransformPlugin(),
    createReactClientCoveragePlugin(),
    ...createRunnerEnvironmentPlugins("react_client"),
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

function parseWebSocketInvoke(raw: unknown): ReactClientWebSocketInvoke | undefined {
  try {
    const message = JSON.parse(String(raw)) as {
      type?: string;
      event?: string;
      data?: Partial<ReactClientWebSocketInvoke>;
    };
    const isVersion = message.event === versionEvent;
    if (
      message.type !== "custom" ||
      (message.event !== invokeEvent && !isVersion) ||
      typeof message.data?.id !== "string" ||
      (!message.data.payload && !isVersion)
    ) {
      return undefined;
    }
    return {
      id: message.data.id,
      environment:
        typeof message.data.environment === "string" ? message.data.environment : "react_client",
      payload: isVersion ? undefined : message.data.payload,
    };
  } catch {
    return undefined;
  }
}

// Vitest sets `server.hmr` to `false`, so the socket goes to the page's own
// host and port, and only needs the token and the base.
function getReactClientWebSocketInfo(server: ViteDevServer) {
  return { token: server.config.webSocketToken, path: server.config.base };
}
