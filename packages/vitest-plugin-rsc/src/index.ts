import { type Plugin, type ViteDevServer } from "vite";
import { vitePluginRscMinimal } from "@vitejs/plugin-rsc/plugin";
import { createReactClientCoveragePlugin } from "./coverage";

const reactClientWebSocketInfoPath = "/@vite/react-client-runner-websocket";
const reactSsrInvokePath = "/@vite/invoke-react-ssr";
const reactClientWebSocketQuery = "vitest-plugin-rsc-react-client";
const reactClientWebSocketInvokeEvent = "vitest-plugin-rsc:react-client:invoke";
const reactClientWebSocketInvokeResultEvent = "vitest-plugin-rsc:react-client:invoke-result";
type ReactClientInvokePayload = Parameters<
  ViteDevServer["environments"][string]["hot"]["handleInvoke"]
>[0];
type ReactClientWebSocketInvoke = {
  id: string;
  payload: ReactClientInvokePayload;
};

export function vitestPluginRSC(): Plugin[] {
  return [
    createViteClientWebSocketPlugin(),
    ...vitePluginRscMinimal({
      environment: {
        browser: "react_client",
        ssr: "react_ssr",
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

            const result = await server.environments["react_client"]!.hot.handleInvoke(
              invoke.payload,
            );

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

        server.middlewares.use(async (req, res, next) => {
          const url = new URL(req.url ?? "/", "https://any.local");
          if (url.pathname === reactClientWebSocketInfoPath) {
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(getReactClientWebSocketInfo(server)));
            return;
          }

          if (url.pathname === reactSsrInvokePath) {
            const payload = JSON.parse(url.searchParams.get("data")!);
            const result = await server.environments["react_ssr"]!.hot.handleInvoke(payload);
            res.end(JSON.stringify(result));
            return;
          }

          next();
        });
      },
      config() {
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
                  "react-dom/server.browser",
                  "react/jsx-runtime",
                  "react/jsx-dev-runtime",
                  "@vitejs/plugin-rsc/vendor/react-server-dom/client.browser",
                ],
                exclude: ["vitest-plugin-rsc", "@vitejs/plugin-rsc"],
              },
            },
            react_ssr: {
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
                  "react-dom/server.browser",
                  "react/jsx-runtime",
                  "react/jsx-dev-runtime",
                  "@vitejs/plugin-rsc/vendor/react-server-dom/client.edge",
                ],
                exclude: ["vitest-plugin-rsc", "@vitejs/plugin-rsc"],
              },
            },
          },
        };
      },
      configResolved(config) {
        const client = config.environments.client!;
        const reactClient = config.environments.react_client!;
        const reactSsr = config.environments.react_ssr!;

        // Vitest browser seeds the default client optimizer with test/setup entries.
        // The hidden react_client runner imports client references later, so without
        // the same scan roots Vite discovers deps mid-test and reloads the page.
        reactClient.optimizeDeps.entries ??= client.optimizeDeps.entries;
        reactClient.optimizeDeps.exclude = [
          ...new Set([
            ...(client.optimizeDeps.exclude ?? []),
            ...(reactClient.optimizeDeps.exclude ?? []),
          ]),
        ];
        reactSsr.optimizeDeps.entries ??= client.optimizeDeps.entries;
        reactSsr.optimizeDeps.include = [
          ...new Set([
            ...(reactClient.optimizeDeps.include ?? []),
            ...(reactSsr.optimizeDeps.include ?? []),
          ]),
        ];
        reactSsr.optimizeDeps.exclude = [
          ...new Set([
            ...(client.optimizeDeps.exclude ?? []),
            ...(reactSsr.optimizeDeps.exclude ?? []),
          ]),
        ];
      },
    },
    createReactClientCoveragePlugin(),
  ];
}

function createViteClientWebSocketPlugin(): Plugin {
  let isVitestBrowserServer = false;

  return {
    name: "rsc:vite-client-websocket",
    configResolved(config) {
      isVitestBrowserServer = config.plugins.some(
        (plugin) => plugin.name === "vitest:browser:config",
      );
    },
    transform(code, id) {
      if (!isVitestBrowserServer || !isViteClientEntry(id)) return;

      const patched = patchViteClientWebSocket(code);
      if (patched === code) {
        this.warn("Could not patch Vite client websocket host. The Vite client shape changed.");
        return;
      }

      return patched;
    },
  };
}

function patchViteClientWebSocket(code: string): string {
  return code
    .replace(
      /const serverHost = __SERVER_HOST__;?/,
      "const serverHost = `${location.host}${__BASE__ || '/'}`;",
    )
    .replace(
      /const socketHost = `\$\{__HMR_HOSTNAME__ \|\| importMetaUrl\.hostname\}:\$\{\s*hmrPort \|\| importMetaUrl\.port\s*\}\$\{__HMR_BASE__\}`;?/,
      "const socketHost = `${location.host}${__HMR_BASE__}`;",
    )
    .replace(
      /const directSocketHost = __HMR_DIRECT_TARGET__;?/,
      "const directSocketHost = socketHost;",
    );
}

function isViteClientEntry(id: string): boolean {
  const cleanId = id.split("?")[0]!.replaceAll("\\", "/");
  return (
    cleanId.endsWith("/vite/dist/client/client.mjs") ||
    cleanId.endsWith("/vite/dist/client/client.js") ||
    cleanId.endsWith("/vite/src/client/client.ts")
  );
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
