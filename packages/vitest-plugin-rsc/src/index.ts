import {
  type Plugin,
  type PluginOption,
  type UserConfig,
  type ViteDevServer,
  version as viteVersion,
} from "vite";
import { vitePluginRscMinimal } from "@vitejs/plugin-rsc/plugin";

const REACT_CLIENT_OPTIMIZE_DEPS_ENTRIES = [
  "src/**/*.{js,jsx,ts,tsx}",
  "app/**/*.{js,jsx,ts,tsx}",
  "components/**/*.{js,jsx,ts,tsx}",
];

const reactClientInvokePath = "/@vite/invoke-react-client";
const reactClientWebSocketInfoPath = "/@vite/react-client-runner-websocket";
const reactClientWebSocketQuery = "vitest-plugin-rsc-react-client";
const reactClientWebSocketInvokeEvent = "vitest-plugin-rsc:react-client:invoke";
const reactClientWebSocketInvokeResultEvent =
  "vitest-plugin-rsc:react-client:invoke-result";
type ReactClientInvokePayload = Parameters<
  ViteDevServer["environments"][string]["hot"]["handleInvoke"]
>[0];
type ReactClientWebSocketPayload = {
  type: "custom";
  event: string;
  data: {
    id: string;
    payload: ReactClientInvokePayload;
  };
};

function isPlugin(plugin: PluginOption): plugin is Plugin {
  return !!plugin && typeof plugin === "object" && "name" in plugin;
}

function flattenPluginNames(plugins: PluginOption[] | undefined): string[] {
  const names: string[] = [];

  for (const plugin of plugins ?? []) {
    if (Array.isArray(plugin)) {
      names.push(...flattenPluginNames(plugin));
    } else if (isPlugin(plugin)) {
      names.push(plugin.name);
    }
  }

  return names;
}

function isVitestBrowserServer(config: UserConfig): boolean {
  return flattenPluginNames(config.plugins).includes("vitest:browser");
}

function disableOptimizer(config: UserConfig, environmentName: string): void {
  const environment = (config.environments ??= {})[environmentName];
  if (!environment) return;

  const optimizeDeps = (environment.optimizeDeps ??= {});
  optimizeDeps.noDiscovery = true;
  optimizeDeps.include = [];
  optimizeDeps.entries = [];
}

function getReactClientOptimizerBundlerOptions() {
  const viteMajor = Number(viteVersion.split(".")[0]);

  if (viteMajor >= 8) {
    return {
      rolldownOptions: {
        platform: "browser",
      },
    };
  }

  return {
    esbuildOptions: {
      platform: "browser",
    },
  };
}

export function vitestPluginRSC(): Plugin[] {
  return [
    ...vitePluginRscMinimal({
      environment: {
        browser: "react_client",
        rsc: "client",
      },
    }),
    {
      name: "rsc:run-in-browser",
      configureServer(server) {
        server.ws.on("connection", (socket, req) => {
          const url = new URL(req.url ?? "/", "https://any.local");
          if (url.searchParams.get(reactClientWebSocketQuery) !== "1") {
            return;
          }

          socket.on("message", async (raw) => {
            const payload = parseWebSocketPayload(raw);
            if (
              payload?.type !== "custom" ||
              payload.event !== reactClientWebSocketInvokeEvent
            ) {
              return;
            }

            const result = await server.environments[
              "react_client"
            ]!.hot.handleInvoke(payload.data.payload);

            socket.send(
              JSON.stringify({
                type: "custom",
                event: reactClientWebSocketInvokeResultEvent,
                data: {
                  id: payload.data.id,
                  result,
                },
              }),
            );
          });
        });

        server.middlewares.use(async (req, res, next) => {
          const url = new URL(req.url ?? "/", "https://any.local");
          if (url.pathname === reactClientWebSocketInfoPath) {
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(getReactClientWebSocketInfo(server)));
            return;
          }

          if (url.pathname === reactClientInvokePath) {
            const payload = JSON.parse(url.searchParams.get("data")!);
            const result =
              await server.environments["react_client"]!.hot.handleInvoke(
                payload,
              );
            res.end(JSON.stringify(result));
            return;
          }
          next();
        });
      },
      config() {
        return {
          environments: {
            client: {
              keepProcessEnv: false,
              resolve: {
                conditions: ["browser", "react-server"],
              },
              optimizeDeps: {
                include: [
                  "react",
                  "react-dom",
                  "react-dom/client",
                  "react/jsx-runtime",
                  "react/jsx-dev-runtime",
                  "@vitejs/plugin-rsc/vendor/react-server-dom/server.edge",
                  "@vitejs/plugin-rsc/vendor/react-server-dom/client.edge",
                ],
                exclude: ["vite", "vitest-plugin-rsc", "@vitejs/plugin-rsc"],
              },
            },
            react_client: {
              consumer: "client",
              keepProcessEnv: false,
              resolve: {
                conditions: ["browser"],
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
                  "@vitejs/plugin-rsc/vendor/react-server-dom/client.browser",
                ],
                noDiscovery: false,
                exclude: ["vitest-plugin-rsc", "@vitejs/plugin-rsc"],
                ...getReactClientOptimizerBundlerOptions(),
              },
            },
          },
        };
      },
    },
    {
      name: "rsc:react-client-optimizer",
      config: {
        order: "post",
        handler(config) {
          const environments = (config.environments ??= {});
          const reactClient = (environments.react_client ??= {});
          const optimizeDeps = (reactClient.optimizeDeps ??= {});

          if (!isVitestBrowserServer(config)) {
            disableOptimizer(config, "client");
            disableOptimizer(config, "react_client");
            return;
          }

          optimizeDeps.noDiscovery = false;
          optimizeDeps.entries ??= REACT_CLIENT_OPTIMIZE_DEPS_ENTRIES;
        },
      },
    },
  ];
}

function parseWebSocketPayload(raw: unknown) {
  try {
    const payload = JSON.parse(String(raw)) as ReactClientWebSocketPayload;
    if (
      payload?.type !== "custom" ||
      typeof payload.event !== "string" ||
      typeof payload.data?.id !== "string" ||
      !payload.data.payload
    ) {
      return undefined;
    }
    return payload;
  } catch {
    return undefined;
  }
}

function getReactClientWebSocketInfo(server: ViteDevServer) {
  const hmr =
    typeof server.config.server.hmr === "object"
      ? server.config.server.hmr
      : undefined;

  return {
    token: server.config.webSocketToken,
    protocol: hmr?.protocol ?? null,
    host: hmr?.host ?? null,
    port: hmr?.clientPort ?? hmr?.port ?? null,
    path: getWebSocketPath(server),
    timeout: hmr?.timeout ?? 30_000,
  };
}

function getWebSocketPath(server: ViteDevServer) {
  const hmr =
    typeof server.config.server.hmr === "object"
      ? server.config.server.hmr
      : undefined;

  if (!hmr?.path) {
    return server.config.base;
  }

  return `${server.config.base.replace(/\/$/, "")}/${hmr.path.replace(
    /^\//,
    "",
  )}`;
}
