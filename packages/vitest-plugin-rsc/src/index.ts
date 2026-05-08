import { type Plugin } from "vite";
import { vitePluginRscMinimal } from "@vitejs/plugin-rsc/plugin";
import {
  REACT_CLIENT_WS_CONFIG_ID,
  REACT_CLIENT_WS_CONFIG_RESOLVED_ID,
} from "./react-client-websocket";
import {
  createReactClientWebSocketConfig,
  installReactClientWebSocketBridge,
} from "./react-client-websocket-server";

export function vitestPluginRSC(): Plugin[] {
  let websocketConfig: string | undefined;

  return [
    ...vitePluginRscMinimal({
      environment: {
        browser: "react_client",
        rsc: "client",
      },
    }),
    {
      name: "rsc:run-in-browser",
      configResolved(config) {
        websocketConfig = JSON.stringify(createReactClientWebSocketConfig(config));
      },
      configureServer(server) {
        installReactClientWebSocketBridge(server);
      },
      resolveId(id) {
        if (id === REACT_CLIENT_WS_CONFIG_ID) {
          return REACT_CLIENT_WS_CONFIG_RESOLVED_ID;
        }
      },
      load(id) {
        if (id === REACT_CLIENT_WS_CONFIG_RESOLVED_ID) {
          if (!websocketConfig) {
            throw new Error(
              "React client WebSocket config was requested before Vite config resolved.",
            );
          }
          return `export default ${websocketConfig};`;
        }
      },
      hotUpdate(ctx) {
        // TODO find out how to do HMR
        ctx.server.ws.send({ type: "full-reload", path: ctx.file });
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
              keepProcessEnv: false,
              resolve: {
                conditions: ["browser"],
                noExternal: true,
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
                esbuildOptions: {
                  platform: "browser",
                },
              },
            },
          },
        };
      },
    },
  ];
}
