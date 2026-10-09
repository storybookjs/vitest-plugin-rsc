import { type Plugin, type ViteDevServer } from "vite";
import { vitePluginRscMinimal } from "@vitejs/plugin-rsc/plugin";
import { createReactClientCoveragePlugin } from "./coverage.ts";
import { createRunnerEnvironmentPlugins } from "./runner-environment.ts";
import { pageViteClientPlugin } from "./vite-client.ts";

const reactClientWebSocketInfoPath = "/@vite/react-client-runner-websocket";
const reactClientWebSocketQuery = "vitest-plugin-rsc-react-client";
const reactClientWebSocketInvokeEvent = "vitest-plugin-rsc:react-client:invoke";
const reactClientWebSocketInvokeResultEvent = "vitest-plugin-rsc:react-client:invoke-result";
const reactClientWebSocketVersionEvent = "vitest-plugin-rsc:react-client:version";
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

export function vitestPluginRSC(): Plugin[] {
  return [
    pageViteClientPlugin(),
    ...vitePluginRscMinimal({
      environment: {
        browser: "react_client",
        rsc: "client",
      },
    }),
    {
      name: "rsc:run-in-browser",
      configureServer(server) {
        // A page keeps the modules it fetched for its next page loads, see
        // utils.ts. An environment has another answer for a module once that
        // module is invalidated: a file changed, or a plugin said so. The
        // version of an environment counts those, so a page that sees
        // another one fetches its modules again.
        const moduleVersions = new Map<string, number>();
        for (const [name, { moduleGraph }] of Object.entries(server.environments)) {
          const invalidateModule = moduleGraph.invalidateModule;
          moduleGraph.invalidateModule = function (...args) {
            moduleVersions.set(name, (moduleVersions.get(name) ?? 0) + 1);
            return invalidateModule.apply(this, args);
          };
        }

        server.ws.on("connection", (socket, req) => {
          const url = new URL(req.url ?? "/", "https://any.local");
          if (url.searchParams.get(reactClientWebSocketQuery) !== "1") {
            return;
          }

          socket.on("message", async (raw) => {
            const invoke = parseWebSocketInvoke(raw);
            if (!invoke) return;

            // The page runs every environment but `client` through a module
            // runner of its own, see utils.ts.
            const environment = server.environments[invoke.environment];
            const result = !invoke.payload
              ? (moduleVersions.get(invoke.environment) ?? 0)
              : environment && invoke.environment !== "client"
                ? await environment.hot.handleInvoke(invoke.payload)
                : {
                    error: { message: `No environment "${invoke.environment}" to run in the page` },
                  };

            socket.send(
              JSON.stringify({
                type: "custom",
                event: reactClientWebSocketInvokeResultEvent,
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
          if (url.pathname === reactClientWebSocketInfoPath) {
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
    createReactClientCoveragePlugin(),
    ...createRunnerEnvironmentPlugins("react_client"),
  ];
}

function parseWebSocketInvoke(raw: unknown): ReactClientWebSocketInvoke | undefined {
  try {
    const message = JSON.parse(String(raw)) as {
      type?: string;
      event?: string;
      data?: Partial<ReactClientWebSocketInvoke>;
    };
    const isVersion = message.event === reactClientWebSocketVersionEvent;
    if (
      message.type !== "custom" ||
      (message.event !== reactClientWebSocketInvokeEvent && !isVersion) ||
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
