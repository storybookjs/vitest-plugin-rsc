import type { Plugin } from "vite";
import type { VitestPluginContext } from "vitest/node";

export function vitestPluginNext(): Plugin[] {
  return [
    {
      name: "next-rsc-plugin",
      configureVitest(context: VitestPluginContext) {
        context.vitest.config.setupFiles.unshift("vitest-plugin-rsc/nextjs/setup");
      },
      config() {
        return {
          define: {
            "process.env": JSON.stringify({}),
            __dirname: JSON.stringify(null),
          },
          optimizeDeps: {
            include: [
              "next/dist/compiled/@edge-runtime/cookies/index.js",
              "next/dist/client/components/is-next-router-error.js",
              "next/dist/client/components/navigation.react-server.js",
              "next/dist/server/node-environment-baseline.js",
              "next/dist/server/app-render/async-local-storage.js",
              "next/dist/server/web/spec-extension/adapters/request-cookies.js",
              "next/dist/shared/lib/server-inserted-html.shared-runtime.js",
            ],
            exclude: ["next/cache", "next/headers", "next/navigation"],
          },
          resolve: {
            alias: {
              "next/link": "next/dist/client/app-dir/link",
              "next/navigation": "vitest-plugin-rsc/dist/nextjs/navigation",
              "next/headers": "vitest-plugin-rsc/nextjs/headers",
              "next/cache": "vitest-plugin-rsc/nextjs/cache",
              "@vercel/turbopack-ecmascript-runtime/browser/dev/hmr-client/hmr-client.ts":
                "next/dist/client/dev/noop-turbopack-hmr",
              "react-server-dom-webpack/client":
                "@vitejs/plugin-rsc/vendor/react-server-dom/client.edge",
            },
          },
          environments: {
            react_client: {
              resolve: {},
              optimizeDeps: {
                include: [
                  "next/link",
                  "next/dist/client/components/app-router-instance.js",
                  "next/dist/client/components/navigation.js",
                  "next/dist/client/components/redirect-boundary.js",
                  "next/dist/client/components/router-reducer/compute-changed-path.js",
                  "next/dist/client/components/router-reducer/create-initial-router-state.js",
                  "next/dist/client/components/use-action-queue.js",
                  "next/dist/shared/lib/app-router-context.shared-runtime.js",
                  "next/dist/shared/lib/hooks-client-context.shared-runtime.js",
                  "next/dist/shared/lib/server-inserted-html.shared-runtime.js",
                ],
              },
            },
          },
        };
      },
    },
  ];
}
