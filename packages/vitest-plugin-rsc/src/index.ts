import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { type Plugin, type ViteDevServer } from "vite";
import { vitePluginRscMinimal } from "@vitejs/plugin-rsc/plugin";
import { createReactClientCoveragePlugin } from "./coverage.ts";
import { createRunnerEnvironmentPlugins } from "./runner-environment.ts";

const reactClientWebSocketInfoPath = "/@vite/react-client-runner-websocket";
const reactClientWebSocketQuery = "vitest-plugin-rsc-react-client";
const reactClientWebSocketInvokeEvent = "vitest-plugin-rsc:react-client:invoke";
const reactClientWebSocketInvokeResultEvent = "vitest-plugin-rsc:react-client:invoke-result";
type ReactClientInvokePayload = Parameters<
  ViteDevServer["environments"][string]["hot"]["handleInvoke"]
>[0];
type ReactClientWebSocketInvoke = {
  id: string;
  environment: string;
  payload: ReactClientInvokePayload;
};

// Vitest wants a file for a setup file. This is `vitest-plugin-rsc/setup-mocks`.
const setupMocksFile = fileURLToPath(
  new URL(`./setup-mocks${path.extname(import.meta.url)}`, import.meta.url),
);

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
    createBrowserApiPortPlugin(),
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
            const invoke = parseWebSocketInvoke(raw);
            if (!invoke) return;

            // The page runs every environment but `client` through a module
            // runner of its own, see utilts.ts.
            const environment = server.environments[invoke.environment];
            const result =
              environment && invoke.environment !== "client"
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
                  "@vitejs/plugin-rsc/vendor/react-server-dom/client.browser",
                ],
                exclude: ["vitest-plugin-rsc", "@vitejs/plugin-rsc"],
              },
            },
          },
        };
      },
    },
    createReactClientCoveragePlugin(),
    {
      name: "rsc:setup-mocks",
      // After the setup files of the project and of other plugins: see
      // setup-mocks.ts.
      enforce: "post",
      config() {
        return { test: { setupFiles: [setupMocksFile] } };
      },
    },
    ...createRunnerEnvironmentPlugins("react_client"),
  ];
}

function createBrowserApiPortPlugin(): Plugin {
  return {
    name: "rsc:browser-api-port",
    async configureServer(server) {
      if (
        !isVitestBrowserServer(server) ||
        server.config.server.strictPort ||
        typeof server.config.server.port !== "number"
      ) {
        return;
      }

      // Vite injects /@vite/client before listen(). Avoid Vite's later port
      // fallback path so the browser receives the final server port up front.
      server.config.server.port = await resolveBrowserApiPort(
        server.config.server.port,
        server.config.server.host,
      );
    },
  };
}

function isVitestBrowserServer(server: ViteDevServer): boolean {
  return server.config.plugins.some((plugin) => plugin.name === "vitest:browser:config");
}

async function resolveBrowserApiPort(
  port: number,
  host: ViteDevServer["config"]["server"]["host"],
) {
  const listenHost = resolveViteListenHost(host);
  try {
    return await listenOnAvailablePort(port, listenHost);
  } catch (error) {
    if (!isAddressInUse(error)) {
      throw error;
    }
    return await listenOnAvailablePort(0, listenHost);
  }
}

function resolveViteListenHost(host: ViteDevServer["config"]["server"]["host"]) {
  // Match Vite's default listen call. Checking "localhost" can miss ports that
  // are unavailable for wildcard binds, which lets Vite fall back after
  // /@vite/client has already captured the old port.
  if (host === undefined || host === false) {
    return undefined;
  }
  if (host === true) {
    return undefined;
  }
  return host;
}

function isAddressInUse(error: unknown): boolean {
  return (
    typeof error === "object" && error !== null && "code" in error && error.code === "EADDRINUSE"
  );
}

function listenOnAvailablePort(port: number, host: string | undefined) {
  return new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.once("error", reject);
    server.listen({ port, host }, () => {
      const address = server.address();
      server.close(() => resolve(typeof address === "object" && address ? address.port : port));
    });
  });
}

function parseWebSocketInvoke(raw: unknown): ReactClientWebSocketInvoke | undefined {
  try {
    const message = JSON.parse(String(raw)) as {
      type?: string;
      event?: string;
      data?: Partial<ReactClientWebSocketInvoke>;
    };
    if (
      message.type !== "custom" ||
      message.event !== reactClientWebSocketInvokeEvent ||
      typeof message.data?.id !== "string" ||
      !message.data.payload
    ) {
      return undefined;
    }
    return {
      id: message.data.id,
      environment:
        typeof message.data.environment === "string" ? message.data.environment : "react_client",
      payload: message.data.payload,
    };
  } catch {
    return undefined;
  }
}

function getReactClientWebSocketInfo(server: ViteDevServer) {
  const hmr = getHmrOptions(server);

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
  const hmr = getHmrOptions(server);

  if (!hmr?.path) {
    return server.config.base;
  }

  return `${server.config.base.replace(/\/$/, "")}/${hmr.path.replace(/^\//, "")}`;
}

function getHmrOptions(server: ViteDevServer) {
  return typeof server.config.server.hmr === "object" ? server.config.server.hmr : undefined;
}
